import { XMLBuilder } from 'fast-xml-parser';
import { AppError } from '../../../appError.js';
import { config } from '../../../config.js';
import { resolveAgencyData } from '../agencyDataResolver.js';
import { buildAugmentationPoint } from './airShoppingBuilder.js';

/**
 * Build NDC 17.2 OfferPriceRQ XML (profile-driven).
 * Supports all NDC 17.2 variants via the airline's builderProfile config.
 *
 * @param {object} offerData - Offer data with ndcReferences + paxIds
 * @param {object} vpData - VP data (used for agency info)
 * @param {string} airlineCode - IATA airline code
 * @returns {string} NDC 17.2 OfferPriceRQ XML (inner body, SOAP wrapping done by transport)
 */
export const buildOfferPrice172RQ = (offerData, vpData, airlineCode) => {
  validateOfferData(offerData);

  const airlineCfg = config.airlines[airlineCode.toLowerCase()] || {};
  const profile = airlineCfg.builderProfile || {};
  const resolved = resolveAgencyData(vpData, airlineCode);

  const rootAttrs = {};

  // Version attribute
  if (profile.versionAttr) {
    rootAttrs['@_Version'] = profile.versionAttr;
  }

  // Language attributes (for profiles with default xmlns)
  if (profile.defaultXmlns) {
    rootAttrs['@_PrimaryLangID'] = 'EN';
    rootAttrs['@_AltLangID'] = 'EN';
    rootAttrs['@_xmlns'] = profile.defaultXmlns;
  } else {
    rootAttrs['@_xmlns'] = 'http://www.iata.org/IATA/EDIST/2017.2';
  }

  // EchoToken (for prefixed namespace profiles)
  if (profile.xmlnsPrefix) {
    const echoToken = String(Math.floor(Math.random() * 100000));
    const timestamp = new Date().toISOString();
    rootAttrs['@_EchoToken'] = echoToken;
    rootAttrs['@_TimeStamp'] = timestamp;
    rootAttrs['@_TransactionIdentifier'] = echoToken;
    rootAttrs['@_Version'] = profile.versionAttr || '2017.2';
  }

  const root = {
    ...rootAttrs,
  };

  // Document element
  root['Document'] = {
    'Name': profile.documentName || 'NDC-Exchange',
  };
  if (profile.documentRefVersion) {
    root['Document']['ReferenceVersion'] = profile.documentRefVersion;
  }

  // AugmentationPoint (placed before Party for profiles that need it early)
  if (profile.defaultXmlns) {
    const aug = buildAugmentationPoint(resolved, airlineCfg);
    if (aug) Object.assign(root, aug);
  }

  // Party element
  root['Party'] = buildParty(resolved, airlineCfg, profile);

  // Query > Offer
  root['Query'] = {
    'Offer': buildOfferQuery(offerData, airlineCode, profile),
  };

  // AugmentationPoint (for prefixed namespace profiles, placed after Query)
  if (profile.xmlnsPrefix) {
    const aug = buildAugmentationPoint(resolved, airlineCfg);
    if (aug) Object.assign(root, aug);
  }

  // DataLists > PassengerList (profile-driven)
  if (profile.includeDataListsInOfferPrice) {
    const paxIds = offerData.paxIds || offerData.ndcReferences?.paxIds || ['T1'];
    root['DataLists'] = {
      'PassengerList': {
        'Passenger': paxIds.map((paxId) => ({
          '@_PassengerID': paxId,
          'PTC': 'ADT',
        })),
      },
    };
  }

  const requestData = {
    'OfferPriceRQ': root,
  };

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    format: true,
    suppressEmptyNode: false,
  });

  return builder.build(requestData);
};

/**
 * Validate offer data contains required NDC references
 */
const validateOfferData = (offerData) => {
  if (!offerData?.ndcReferences?.offerId) {
    throw new AppError({ statusCode: 400, msg: 'Offer ID is required for repricing' });
  }
  if (!offerData.ndcReferences?.offerItemIds || offerData.ndcReferences.offerItemIds.length === 0) {
    throw new AppError({ statusCode: 400, msg: 'Offer item IDs are required for repricing' });
  }
};

/**
 * Build Query > Offer element for NDC 17.2 OfferPriceRQ (profile-driven)
 */
const buildOfferQuery = (offerData, airlineCode, profile) => {
  const ndcRefs = offerData.ndcReferences;
  const paxIds = offerData.paxIds || ndcRefs.paxIds || [];

  const offerItems = ndcRefs.offerItemIds.map((itemId) => {
    const item = {
      '@_OfferItemID': itemId,
    };
    if (paxIds.length > 0) {
      item['PassengerRefs'] = paxIds.join(' ');
    }
    // FlightRefs and ServiceRefs (profile-driven)
    if (profile.includeFlightRefs && ndcRefs.flightRefs?.length > 0) {
      item['FlightRefs'] = ndcRefs.flightRefs.join(' ');
    }
    if (profile.includeServiceRefs && ndcRefs.serviceRefs?.length > 0) {
      item['ServiceRefs'] = ndcRefs.serviceRefs.join(' ');
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
  offer['OfferItem'] = offerItems;

  return offer;
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

  // Name + Contacts (profile-driven)
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
  }

  sender['IATA_Number'] = resolved.iataNumber;
  sender['AgencyID'] = resolved.agencyId;

  // AgentUser (for prefixed namespace profiles)
  if (profile.xmlnsPrefix) {
    sender['AgentUser'] = {
      'AgentUserID': (resolved.agentName || '').substring(0, 16),
    };
  }

  // Participants (profile-driven)
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
