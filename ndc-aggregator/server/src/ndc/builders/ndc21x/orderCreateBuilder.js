import { XMLBuilder } from 'fast-xml-parser';
import { randomUUID } from 'crypto';
import { constants } from '../../../constants.js';
import { AppError } from '../../../appError.js';
import { config } from '../../../config.js';
import { resolveAgencyData } from '../agencyDataResolver.js';
import { buildDistributionChain, formatPaxId } from './airShoppingBuilder.js';

/**
 * Build NDC 21.x OrderCreateRQ XML (profile-driven).
 * Supports all NDC 21.x variants via the airline's builderProfile and distributionChain config.
 *
 * @param {object} orderData - Merged object with ndcReferences + passengers + payment
 * @param {object} vpData - VP data for DistributionChain injection
 * @param {string} airlineCode - IATA airline code
 * @returns {string} NDC 21.x OrderCreateRQ XML
 */
export const buildOrderCreate21xRQ = (orderData, vpData, airlineCode) => {
  const offerData = { ndcReferences: orderData.ndcReferences, shoppingResponseId: orderData.shoppingResponseId };
  const orderRequest = { passengers: orderData.passengers, payment: orderData.payment };

  validateOrderRequest(offerData, orderRequest);

  const airlineCfg = config.airlines[airlineCode.toLowerCase()] || {};
  const profile = airlineCfg.builderProfile || {};
  const resolved = resolveAgencyData(vpData, airlineCode);
  const requestId = randomUUID();

  const rootAttrs = {
    '@_xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
    '@_xmlns:n1': 'http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage',
    '@_xmlns:cns': 'http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes',
  };

  if (profile.includeSchemaLocation) {
    rootAttrs['@_xsi:schemaLocation'] = 'http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage';
  }

  const root = {
    ...rootAttrs,
    'n1:DistributionChain': buildDistributionChain(vpData, airlineCode),
  };

  // PayloadAttributes — profile-driven
  if (profile.includePayloadAttributes) {
    root['n1:PayloadAttributes'] = {};
    if (profile.includeTrxId) {
      root['n1:PayloadAttributes']['cns:TrxID'] = vpData?.txId || `${resolved.agencyId || 'agency'}-${requestId.substring(0, 30)}`;
    }
    if (profile.includeCorrelationId) {
      root['n1:PayloadAttributes']['cns:CorrelationID'] = `${resolved.agencyId || 'agency'}-${randomUUID().substring(0, 30)}`;
    }
    if (profile.includePrimaryLangID) {
      root['n1:PayloadAttributes']['cns:PrimaryLangID'] = 'EN';
    }
    root['n1:PayloadAttributes']['cns:VersionNumber'] = profile.versionNumber || '21.36';
  }

  // POS element (profile-driven)
  if (profile.includePOS) {
    root['n1:POS'] = {
      'cns:Country': {
        'cns:CountryCode': airlineCfg.posCountryCode || 'IN',
      },
    };
  }

  // Determine PaxID format for OrderCreate
  const paxIdFmt = profile.orderPaxIdFormat || profile.paxIdFormat || 'PAX_underscore_numeric';
  const passengers = orderRequest.passengers || [];
  const paxRefIds = passengers.map((_, idx) => formatPaxId(paxIdFmt, idx));

  // Request element
  root['n1:Request'] = {
    'cns:CreateOrder': buildCreateOrder(offerData, paxRefIds, airlineCode),
    'cns:DataLists': {
      'cns:ContactInfoList': buildContactInfoList(passengers, profile, paxIdFmt),
      'cns:PaxList': buildPaxList(passengers, profile, paxIdFmt),
    },
  };

  // PaymentFunctions (profile-driven)
  if (profile.includePaymentFunctions) {
    root['n1:Request']['cns:PaymentFunctions'] = buildPaymentFunctions(orderRequest.payment, offerData);
  }

  const requestData = {
    'n1:IATA_OrderCreateRQ': root,
  };

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    format: true,
    suppressEmptyNode: true,
  });

  const xml = builder.build(requestData);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
};

/**
 * Validate order request data
 */
const validateOrderRequest = (offerData, orderRequest) => {
  if (!offerData?.ndcReferences?.offerId) {
    throw new AppError({ statusCode: 400, msg: 'Offer ID is required for order creation' });
  }
  if (!orderRequest?.passengers || orderRequest.passengers.length === 0) {
    throw new AppError({ statusCode: 400, msg: 'At least one passenger is required' });
  }

  orderRequest.passengers.forEach((passenger, index) => {
    if (!passenger.firstName || !passenger.lastName) {
      throw new AppError({ statusCode: 400, msg: `Passenger ${index + 1}: First name and last name are required` });
    }
    if (!passenger.dateOfBirth) {
      throw new AppError({ statusCode: 400, msg: `Passenger ${index + 1}: Date of birth is required` });
    }
    if (!passenger.document?.number || !passenger.document?.type) {
      throw new AppError({ statusCode: 400, msg: `Passenger ${index + 1}: Travel document (passport/ID) is required` });
    }
    if (!passenger.contact?.email && !passenger.contact?.phone) {
      throw new AppError({ statusCode: 400, msg: `Passenger ${index + 1}: Contact information (email or phone) is required` });
    }
  });
};

/**
 * Build CreateOrder element (NDC 21.x)
 */
const buildCreateOrder = (offerData, paxRefIds, airlineCode) => {
  const ndcRefs = offerData.ndcReferences;
  const selectedOfferItems = buildSelectedOfferItems(ndcRefs, paxRefIds);

  return {
    'cns:AcceptSelectedQuotedOfferList': {
      'cns:SelectedPricedOffer': {
        'cns:OfferRefID': ndcRefs.offerId,
        'cns:OwnerCode': ndcRefs.ownerCode || airlineCode,
        'cns:SelectedOfferItem': selectedOfferItems.length === 1 ? selectedOfferItems[0] : selectedOfferItems,
      },
    },
  };
};

/**
 * Build SelectedOfferItem array from ndcReferences.
 */
const buildSelectedOfferItems = (ndcRefs, paxRefIds) => {
  if (ndcRefs.offerItemPaxRefs?.length > 0 && ndcRefs.offerItemPaxRefs.some((r) => r.paxIds.length > 0)) {
    return ndcRefs.offerItemPaxRefs.map((ref) => ({
      'cns:OfferItemRefID': ref.offerItemId,
      'cns:PaxRefID': ref.paxIds,
    }));
  }

  if (ndcRefs.offerItemIds.length > 1 && ndcRefs.offerItemIds.length === paxRefIds.length) {
    return ndcRefs.offerItemIds.map((itemId, idx) => ({
      'cns:OfferItemRefID': itemId,
      'cns:PaxRefID': [paxRefIds[idx]],
    }));
  }

  return [{
    'cns:OfferItemRefID': ndcRefs.offerItemIds[0],
    'cns:PaxRefID': paxRefIds,
  }];
};

/**
 * Derive gender code (M/F)
 */
const deriveGenderCode = (gender) => {
  if (!gender) return 'M';
  const g = gender.toUpperCase();
  if (g === 'FEMALE' || g === 'F') return 'F';
  return 'M';
};

/**
 * Derive title from gender
 */
const deriveTitleFromGender = (gender, title) => {
  if (title) return title;
  if (!gender) return 'MR';
  const g = gender.toUpperCase();
  if (g === 'FEMALE' || g === 'F') return 'MS';
  return 'MR';
};

/**
 * Build PaxList (profile-driven)
 */
const buildPaxList = (passengers, profile, paxIdFmt) => {
  const paxList = { 'cns:Pax': [] };

  passengers.forEach((passenger, index) => {
    const paxId = formatPaxId(paxIdFmt, index);

    const individual = {
      'cns:Birthdate': passenger.dateOfBirth,
      'cns:GenderCode': deriveGenderCode(passenger.gender),
      'cns:GivenName': passenger.firstName,
    };

    // IndividualID (profile-driven)
    if (profile.includeIndividualId) {
      individual['cns:IndividualID'] = paxId;
    }

    individual['cns:Surname'] = passenger.lastName;
    individual['cns:TitleName'] = deriveTitleFromGender(passenger.gender, passenger.title);

    const pax = {};

    // ContactInfoRefID (only for profiles without multiple contact info)
    if (!profile.multipleContactInfo) {
      const contactId = `PAX${index + 1}_CNT`;
      pax['cns:ContactInfoRefID'] = contactId;
    }

    pax['cns:IdentityDoc'] = buildIdentityDoc(passenger, profile);
    pax['cns:Individual'] = individual;

    // LangUsage (profile-driven)
    if (profile.includeLangUsageInPax) {
      pax['cns:LangUsage'] = { 'cns:LangCode': 'EN' };
    }

    pax['cns:PaxID'] = paxId;
    pax['cns:PTC'] = passenger.type || constants.passengerTypes.ADT.code;

    // Remark (profile-driven)
    if (profile.includeRemark) {
      pax['cns:Remark'] = { 'cns:RemarkText': profile.remarkText || 'TEST' };
    }

    paxList['cns:Pax'].push(pax);
  });

  return paxList;
};

/**
 * Build IdentityDoc (profile-driven)
 */
const buildIdentityDoc = (passenger, profile) => {
  const doc = passenger.document || {};

  let expiryDate = doc.expiryDate || '';
  if (!expiryDate && (doc.type === 'PT' || doc.type === constants.documentTypes.PASSPORT || !doc.type)) {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 10);
    expiryDate = future.toISOString().split('T')[0];
  }

  const identityDoc = {};

  // CitizenshipCountryCode (not all profiles include it)
  if (!profile.includeIndividualId) {
    // Full identity doc format
    identityDoc['cns:CitizenshipCountryCode'] = doc.citizenshipCountry || passenger.nationality || doc.issuingCountry || '';
  }

  identityDoc['cns:ExpiryDate'] = expiryDate;
  identityDoc['cns:IdentityDocID'] = doc.number || '';
  identityDoc['cns:IdentityDocTypeCode'] = doc.type || constants.documentTypes.PASSPORT;

  if (!profile.includeIndividualId) {
    identityDoc['cns:IssueDate'] = doc.issueDate || '';
  }

  identityDoc['cns:IssuingCountryCode'] = doc.issuingCountry || passenger.nationality || '';
  identityDoc['cns:ResidenceCountryCode'] = doc.residenceCountry || passenger.nationality || doc.issuingCountry || '';
  identityDoc['cns:Surname'] = passenger.lastName || '';

  return identityDoc;
};

/**
 * Parse phone number from various input formats into NDC components.
 */
const parsePhoneNumber = (contact) => {
  let phone = contact.phone || '';
  let countryCode = contact.countryCode || '';
  let areaCode = contact.areaCode || '';

  if (phone.startsWith('+') && !countryCode) {
    const stripped = phone.substring(1);
    const oneDigitCodes = ['1', '7'];
    const firstOne = stripped.substring(0, 1);

    if (oneDigitCodes.includes(firstOne)) {
      countryCode = firstOne;
      phone = stripped.substring(1);
    } else if (stripped.length > 2) {
      countryCode = stripped.substring(0, 2);
      phone = stripped.substring(2);
    } else {
      phone = stripped;
    }
  } else if (phone.startsWith('+') && countryCode) {
    phone = phone.replace(/^\+\d{1,3}/, '');
  }

  if (!areaCode && ['1', '7'].includes(countryCode) && phone.length >= 10) {
    areaCode = phone.substring(0, 3);
    phone = phone.substring(3);
  }

  return { countryCode: countryCode || '', areaCode, phoneNumber: phone };
};

/**
 * Build ContactInfoList (profile-driven).
 * Standard: one ContactInfo per pax.
 * Extended (multipleContactInfo): primary + NTF + BIL + mailing per pax.
 */
const buildContactInfoList = (passengers, profile, paxIdFmt) => {
  const contactInfoList = { 'cns:ContactInfo': [] };

  passengers.forEach((passenger, index) => {
    if (!passenger.contact) return;

    if (profile.multipleContactInfo) {
      buildMultipleContactInfo(contactInfoList, passenger, index, paxIdFmt);
    } else {
      buildSingleContactInfo(contactInfoList, passenger, index);
    }
  });

  return contactInfoList;
};

/**
 * Build single ContactInfo per passenger (standard pattern)
 */
const buildSingleContactInfo = (contactInfoList, passenger, index) => {
  const contactId = `PAX${index + 1}_CNT`;

  const contactInfo = {
    'cns:ContactInfoID': contactId,
  };

  if (passenger.contact.email) {
    contactInfo['cns:EmailAddress'] = {
      'cns:EmailAddressText': passenger.contact.email,
    };
  }

  contactInfo['cns:Individual'] = {
    'cns:GivenName': passenger.firstName,
    'cns:Surname': passenger.lastName,
  };

  if (passenger.contact.phone) {
    const parsed = parsePhoneNumber(passenger.contact);
    contactInfo['cns:Phone'] = {
      'cns:AreaCodeNumber': parsed.areaCode,
      'cns:ContactTypeText': 'M',
      'cns:CountryDialingCode': parsed.countryCode,
      'cns:ExtensionNumber': '',
      'cns:PhoneNumber': parsed.phoneNumber,
    };
  }

  if (passenger.contact.secondaryPhone) {
    const parsed2 = parsePhoneNumber({ phone: passenger.contact.secondaryPhone, countryCode: passenger.contact.countryCode, areaCode: passenger.contact.areaCode });
    contactInfo['cns:Phone2'] = {
      'cns:AreaCodeNumber': parsed2.areaCode,
      'cns:ContactTypeText': 'H',
      'cns:CountryDialingCode': parsed2.countryCode,
      'cns:ExtensionNumber': '',
      'cns:PhoneNumber': parsed2.phoneNumber,
    };
  }

  contactInfo['cns:PostalAddress'] = {
    'cns:CountryCode': passenger.nationality || passenger.document?.issuingCountry || '',
  };

  contactInfoList['cns:ContactInfo'].push(contactInfo);
};

/**
 * Build multiple ContactInfo entries per passenger (extended pattern)
 */
const buildMultipleContactInfo = (contactInfoList, passenger, index, paxIdFmt) => {
  const paxId = formatPaxId(paxIdFmt, index);
  const baseId = `CTCPAX${index + 1}`;

  // 1. Primary contact info
  const primaryContact = {
    'cns:ContactInfoID': `${baseId}_1`,
  };

  const emailAddresses = [];
  if (passenger.contact.email) {
    emailAddresses.push({
      'cns:ContactTypeText': 'Home',
      'cns:EmailAddressText': passenger.contact.email,
    });
    emailAddresses.push({
      'cns:ContactTypeText': 'Business',
      'cns:EmailAddressText': passenger.contact.email,
    });
  }
  if (emailAddresses.length > 0) {
    primaryContact['cns:EmailAddress'] = emailAddresses;
  }

  primaryContact['cns:Individual'] = {
    'cns:Surname': passenger.lastName,
  };
  primaryContact['cns:IndividualRefID'] = paxId;

  if (passenger.contact.phone) {
    const parsed = parsePhoneNumber(passenger.contact);
    primaryContact['cns:Phone'] = {
      'cns:AreaCodeNumber': parsed.areaCode,
      'cns:ContactTypeText': 'Mobile',
      'cns:CountryDialingCode': parsed.countryCode,
      'cns:PhoneNumber': parsed.phoneNumber,
    };
  }

  contactInfoList['cns:ContactInfo'].push(primaryContact);

  // 2. NTF notification contact
  if (passenger.contact.email) {
    contactInfoList['cns:ContactInfo'].push({
      'cns:ContactInfoID': `${baseId}_2`,
      'cns:ContactPurposeText': 'NTF',
      'cns:EmailAddress': {
        'cns:EmailAddressText': passenger.contact.email,
      },
      'cns:Individual': {
        'cns:Surname': passenger.lastName,
      },
      'cns:IndividualRefID': paxId,
    });
  }

  // 3. BIL billing address
  const nationality = passenger.nationality || passenger.document?.issuingCountry || '';
  contactInfoList['cns:ContactInfo'].push({
    'cns:ContactInfoID': `${baseId}_3`,
    'cns:ContactPurposeText': 'BIL',
    'cns:Individual': {
      'cns:Surname': passenger.lastName,
    },
    'cns:IndividualRefID': paxId,
    'cns:PostalAddress': {
      'cns:CityName': passenger.contact.city || '',
      'cns:ContactTypeText': 'BILLING',
      'cns:CountryCode': nationality,
      'cns:PostalCode': passenger.contact.postalCode || '',
      'cns:StreetText': passenger.contact.street || '',
    },
  });

  // 4. Mailing address (purpose code 702)
  contactInfoList['cns:ContactInfo'].push({
    'cns:ContactInfoID': `${baseId}_4`,
    'cns:ContactPurposeText': '702',
    'cns:Individual': {
      'cns:Surname': passenger.lastName,
    },
    'cns:IndividualRefID': paxId,
    'cns:PostalAddress': {
      'cns:CityName': passenger.contact.city || '',
      'cns:ContactTypeText': 'MAILING',
      'cns:CountryCode': nationality,
      'cns:PostalCode': passenger.contact.postalCode || '',
      'cns:StreetText': passenger.contact.street || '',
    },
  });
};

/**
 * Build PaymentFunctions (profile-driven)
 */
const buildPaymentFunctions = (payment, offerData) => {
  const card = payment?.card || {};
  const price = offerData?.price || offerData?.ndcReferences?.price || {};

  const brandCodeMap = { visa: 'VI', mastercard: 'CA', amex: 'AX' };
  const brandCode = card.brandCode || brandCodeMap[card.cardType?.toLowerCase()] || 'CA';

  const expirationDate = card.expirationDate
    || (card.expiry ? card.expiry.replace('/', '') : '');

  return {
    'cns:PaymentProcessingDetails': {
      'cns:Amount': {
        '@_CurCode': price.currency || 'USD',
        '#text': String(price.total || '0'),
      },
      'cns:PaymentMethod': {
        'cns:PaymentCard': {
          'cns:CardBrandCode': brandCode,
          'cns:CardNumber': card.cardNumber || card.number || '',
          'cns:CardSecurityCode': card.securityCode || card.cvv || '',
          'cns:ExpirationDate': expirationDate || '',
        },
      },
    },
  };
};
