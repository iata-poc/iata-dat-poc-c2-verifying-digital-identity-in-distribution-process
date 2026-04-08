import { XMLBuilder } from 'fast-xml-parser';
import { AppError } from '../../../appError.js';
import { constants } from '../../../constants.js';
import { config } from '../../../config.js';
import { resolveAgencyData } from '../agencyDataResolver.js';
import { buildAugmentationPoint } from './airShoppingBuilder.js';

/**
 * Build NDC 17.2 OrderCreateRQ XML (profile-driven).
 * Supports all NDC 17.2 variants via the airline's builderProfile config.
 *
 * @param {object} orderData - Merged { ndcReferences, shoppingResponseId, price, passengers, payment }
 * @param {object} vpData - VP data (used for agency info)
 * @param {string} airlineCode - IATA airline code
 * @returns {string} NDC 17.2 OrderCreateRQ XML (inner body, SOAP wrapping done by transport)
 */
export const buildOrderCreate172RQ = (orderData, vpData, airlineCode) => {
  const offerData = {
    ndcReferences: orderData.ndcReferences,
    shoppingResponseId: orderData.shoppingResponseId,
    price: orderData.price,
  };
  const orderRequest = { passengers: orderData.passengers, payment: orderData.payment };

  const airlineCfg = config.airlines[airlineCode.toLowerCase()] || {};
  const profile = airlineCfg.builderProfile || {};

  validateOrderRequest(offerData, orderRequest, profile);

  const resolved = resolveAgencyData(vpData, airlineCode);

  const rootAttrs = {};

  // Version attribute
  if (profile.versionAttr) {
    rootAttrs['@_Version'] = profile.versionAttr;
  }

  // Language attributes
  if (profile.defaultXmlns) {
    rootAttrs['@_PrimaryLangID'] = 'EN';
    rootAttrs['@_AltLangID'] = 'EN';
    rootAttrs['@_xmlns'] = profile.defaultXmlns;
  } else {
    rootAttrs['@_Version'] = profile.versionAttr || '2017.2';
    rootAttrs['@_PrimaryLangID'] = 'EN';
  }

  const root = { ...rootAttrs };

  // Profile-driven element ordering
  if (profile.defaultXmlns) {
    // Document → AugmentationPoint → Party → Query
    root['Document'] = { 'Name': profile.documentName || 'NDC-Exchange' };

    const aug = buildAugmentationPoint(resolved, airlineCfg);
    if (aug) Object.assign(root, aug);

    root['Party'] = buildParty(resolved, airlineCfg, profile);
    root['Query'] = buildQuery(offerData, orderRequest, profile, airlineCode);
  } else {
    // AugmentationPoint → PointOfSale → Party → Document → Parameters → Query
    const aug = buildAugmentationPoint(resolved, airlineCfg);
    if (aug) Object.assign(root, aug);

    if (profile.pointOfSaleCountry) {
      root['PointOfSale'] = {
        'Location': {
          'CountryCode': profile.pointOfSaleCountry,
        },
      };
    }

    root['Party'] = buildParty(resolved, airlineCfg, profile);

    root['Document'] = {
      'Name': profile.documentName || 'NDC-Exchange',
    };
    if (profile.documentRefVersion) {
      root['Document']['ReferenceVersion'] = `IATA NDC ${profile.versionAttr || '17.2'}`;
    }

    if (profile.includeLanguages) {
      root['Parameters'] = {
        'Languages': {
          'LanguageCode': profile.languageCode || 'en',
        },
      };
    }

    root['Query'] = buildQuery(offerData, orderRequest, profile, airlineCode);
  }

  const requestData = {
    'OrderCreateRQ': root,
  };

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    format: true,
    suppressEmptyNode: false,
  });

  return builder.build(requestData);
};

/**
 * Validate order request data (profile-driven strictness)
 */
const validateOrderRequest = (offerData, orderRequest, profile) => {
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
    // Relaxed validation skips document requirement
    if (profile.orderValidation !== 'relaxed') {
      if (!passenger.document?.number || !passenger.document?.type) {
        throw new AppError({ statusCode: 400, msg: `Passenger ${index + 1}: Travel document (passport/ID) is required` });
      }
    }
    if (!passenger.contact?.email && !passenger.contact?.phone) {
      throw new AppError({ statusCode: 400, msg: `Passenger ${index + 1}: Contact information (email or phone) is required` });
    }
  });
};

/**
 * Build Query element containing Order + DataLists
 */
const buildQuery = (offerData, orderRequest, profile, airlineCode) => {
  const query = {
    'Order': buildOrder(offerData, orderRequest.passengers, profile, airlineCode),
    'DataLists': {
      'PassengerList': {
        'Passenger': buildPassengerList(orderRequest.passengers, profile),
      },
      'ContactList': {
        'ContactInformation': buildContactList(orderRequest.passengers, profile),
      },
    },
  };

  return query;
};

/**
 * Build Order element (profile-driven)
 */
const buildOrder = (offerData, passengers, profile, airlineCode) => {
  const ndcRefs = offerData.ndcReferences;
  const format = profile.paxIdFormat || 'PTC_numeric';
  const paxIds = ndcRefs.paxIds || generatePaxIds(passengers, format);

  const offerItems = ndcRefs.offerItemIds.map((itemId) => {
    const item = { '@_OfferItemID': itemId };
    // Some profiles include PassengerRefs on OfferItem
    if (profile.defaultXmlns || true) {
      item['PassengerRefs'] = paxIds.join(' ');
    }
    return item;
  });

  const offer = {
    '@_OfferID': ndcRefs.offerId,
    '@_Owner': ndcRefs.ownerCode || airlineCode,
  };
  if (offerData.shoppingResponseId) {
    offer['@_ResponseID'] = offerData.shoppingResponseId;
  }

  // TotalOfferPrice (for profiles that include it)
  const price = offerData.price || {};
  if (price.total && !profile.defaultXmlns) {
    offer['TotalOfferPrice'] = {
      '@_Code': price.currency || 'CAD',
      '#text': String(price.total),
    };
  }

  offer['OfferItem'] = offerItems;

  return { 'Offer': offer };
};

/**
 * Generate PaxIDs based on format
 */
const generatePaxIds = (passengers, format) => {
  if (format === 'T_numeric') {
    return passengers.map((_, idx) => `T${idx + 1}`);
  }
  // PTC_numeric
  const typeCounts = {};
  return passengers.map((pax) => {
    const ptc = pax.type || 'ADT';
    const idx = typeCounts[ptc] || 0;
    typeCounts[ptc] = idx + 1;
    return `Pax${String(idx + 1).padStart(2, '0')}`;
  });
};

/**
 * Build PassengerList (profile-driven)
 */
const buildPassengerList = (passengers, profile) => {
  const format = profile.paxIdFormat || 'PTC_numeric';

  return passengers.map((pax, idx) => {
    const paxId = format === 'T_numeric' ? `T${idx + 1}` : `Pax${String(idx + 1).padStart(2, '0')}`;
    const contactRef = format === 'T_numeric' ? `ContactInfo-T${idx + 1}` : `CONTACT_For_TravelerRefNumber${idx + 1}`;
    const gender = deriveGender(pax.gender, profile);
    const title = deriveTitle(pax.gender, pax.title, profile);

    const passenger = {
      '@_PassengerID': paxId,
      'PTC': pax.type || constants.passengerTypes.ADT.code,
    };

    // Individual
    const individual = {
      'Birthdate': pax.dateOfBirth,
      'Gender': gender,
      'NameTitle': title,
      'GivenName': pax.firstName,
      'Surname': pax.lastName,
    };

    // SurnameSuffix (for profiles that include it)
    if (format !== 'T_numeric') {
      individual['SurnameSuffix'] = title === 'Mr' ? 'Mister' : 'Miss';
    }

    passenger['Individual'] = individual;

    // IdentityDocument (not for relaxed validation profiles)
    if (profile.orderValidation !== 'relaxed' && pax.document) {
      let expiryDate = pax.document?.expiryDate || '';
      if (!expiryDate) {
        const future = new Date();
        future.setFullYear(future.getFullYear() + 10);
        expiryDate = future.toISOString().split('T')[0];
      }

      passenger['IdentityDocument'] = {
        'IdentityDocumentNumber': pax.document?.number || '',
        'IdentityDocumentType': formatDocumentType(pax.document?.type, pax.document?.issuingCountry || pax.nationality),
        'IssuingCountryCode': pax.document?.issuingCountry || pax.nationality || '',
        'CitizenshipCountryCode': pax.document?.citizenshipCountry || pax.nationality || '',
        'ExpiryDate': expiryDate,
        'Birthdate': pax.dateOfBirth,
        'Gender': gender,
        'NameTitle': title,
      };

      if (format !== 'T_numeric') {
        passenger['IdentityDocument']['SurnameSuffix'] = title === 'Mr' ? 'Mister' : 'Miss';
      }
    }

    passenger['ContactInfoRef'] = contactRef;

    return passenger;
  });
};

/**
 * Build ContactList (profile-driven)
 */
const buildContactList = (passengers, profile) => {
  const format = profile.paxIdFormat || 'PTC_numeric';

  return passengers.map((pax, idx) => {
    const contactId = format === 'T_numeric' ? `ContactInfo-T${idx + 1}` : `CONTACT_For_TravelerRefNumber${idx + 1}`;
    const contact = pax.contact || {};
    const contactProvided = [];

    if (contact.email) {
      contactProvided.push({
        'EmailAddress': {
          'EmailAddressValue': contact.email,
        },
      });
    }

    if (contact.phone) {
      if (format === 'T_numeric') {
        // Simple phone format
        const phone = { 'Label': 'mobile' };
        if (contact.countryDialingCode) phone['CountryDialingCode'] = contact.countryDialingCode;
        if (contact.areaCode) phone['AreaCode'] = contact.areaCode;
        phone['PhoneNumber'] = contact.phone;
        contactProvided.push({ 'Phone': phone });
      } else {
        // Structured phone format
        const rawPhone = contact.phone.replace(/[\s\-()]/g, '').replace(/^\+/, '');
        const parsed = parsePhoneNumber(rawPhone);
        const phone = {
          'Label': '8.PLT',
          'CountryDialingCode': parsed.countryCode,
          'AreaCode': parsed.areaCode,
          'PhoneNumber': parsed.number,
          'Extension': contact.phoneExtension || '1258',
        };
        contactProvided.push({ 'Phone': phone });
      }
    }

    const info = {
      '@_ContactID': contactId,
      'ContactType': profile.contactType || '1.PTT',
    };

    if (contactProvided.length > 0) {
      info['ContactProvided'] = contactProvided;
    }

    // PostalAddress (for structured profiles)
    if (format !== 'T_numeric') {
      if (contact.address || contact.city || contact.country || contact.postCode) {
        info['PostalAddress'] = {};
        if (contact.state) info['PostalAddress']['CountrySubdivisionName'] = contact.state;
        if (contact.country) info['PostalAddress']['CountryCode'] = normalizeCountryCode(contact.country);
        if (contact.city) info['PostalAddress']['CityName'] = contact.city;
        if (contact.address) info['PostalAddress']['Street'] = contact.address;
        if (contact.postCode) info['PostalAddress']['PostalCode'] = contact.postCode;
      }
    }

    return info;
  });
};

/**
 * Build Party element (profile-driven)
 */
const buildParty = (resolved, airlineCfg, profile) => {
  const party = {
    'Sender': {
      'TravelAgencySender': {},
    },
  };

  const sender = party['Sender']['TravelAgencySender'];

  if (profile.includeContacts || profile.includeParticipants) {
    sender['Name'] = resolved.agencyName;
  }

  if (profile.includeContacts) {
    sender['Contacts'] = {
      'Contact': [
        {
          'AddressContact': {
            'Street': [airlineCfg.contactStreet1 || '', airlineCfg.contactStreet2 || ''],
            'CityName': airlineCfg.contactCity || '',
            'StateProv': airlineCfg.contactState || '',
            'PostalCode': airlineCfg.contactPostalCode || '',
            'CountryCode': resolved.contactCountry || '',
          },
        },
        {
          'EmailContact': {
            'Address': resolved.contactEmail || '',
          },
        },
      ],
    };
  } else if (!profile.includeParticipants) {
    // Simple contacts (just email)
    sender['Contacts'] = {
      'Contact': {
        'EmailContact': {
          'Address': resolved.contactEmail || '',
        },
      },
    };
  }

  sender['IATA_Number'] = resolved.iataNumber;
  sender['AgencyID'] = resolved.agencyId;

  if (profile.xmlnsPrefix) {
    sender['AgentUser'] = {
      'AgentUserID': (resolved.agentName || '').substring(0, 16),
    };
  }

  if (profile.includeParticipants) {
    party['Participants'] = {
      'Participant': {
        'AggregatorParticipant': {
          '@_SequenceNumber': '1',
          'Name': resolved.aggregatorName,
          'AggregatorID': resolved.aggregatorId,
        },
      },
    };
  }

  return party;
};

// ─── Utility functions ───

const deriveGender = (gender, _profile) => {
  if (!gender) return 'Male';
  const g = gender.toUpperCase();
  if (g === 'FEMALE' || g === 'F') return 'Female';
  return 'Male';
};

const deriveTitle = (gender, title, profile) => {
  if (title) {
    return profile.titleFormat === 'upper' ? title.toUpperCase() : title;
  }
  if (!gender) return profile.titleFormat === 'upper' ? 'SIR' : 'Mr';
  const g = gender.toUpperCase();
  if (g === 'FEMALE' || g === 'F') return profile.titleFormat === 'upper' ? 'MADAM' : 'Ms';
  return profile.titleFormat === 'upper' ? 'SIR' : 'Mr';
};

const formatDocumentType = (docType, country) => {
  const countryName = {
    US: 'US', SG: 'Singapore', CA: 'Canadian', GB: 'UK', AE: 'UAE',
  }[country?.toUpperCase()] || country || 'US';
  const docLabel = {
    PT: 'Passport', NI: 'National ID', DL: 'Drivers License',
  }[docType?.toUpperCase()] || 'Passport';
  return `${countryName} ${docLabel}`;
};

const parsePhoneNumber = (digits) => {
  const oneDigitCodes = ['1'];
  let countryCode, rest;

  if (oneDigitCodes.includes(digits[0])) {
    countryCode = digits[0];
    rest = digits.substring(1);
  } else if (digits.length > 10) {
    countryCode = digits.substring(0, 2);
    rest = digits.substring(2);
  } else {
    countryCode = '';
    rest = digits;
  }

  const areaCode = rest.substring(0, 3);
  const number = rest.substring(3);

  return { countryCode, areaCode, number };
};

const normalizeCountryCode = (val) => {
  if (!val) return '';
  const map = { usa: 'US', uk: 'GB', canada: 'CA', uae: 'AE', singapore: 'SG' };
  const lower = val.toLowerCase();
  if (map[lower]) return map[lower];
  return val.toUpperCase().substring(0, 2);
};
