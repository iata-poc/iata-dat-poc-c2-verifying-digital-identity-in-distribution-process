import { XMLBuilder } from 'fast-xml-parser';
import { AppError } from '../../../appError.js';
import { config } from '../../../config.js';
import { resolveAgencyData } from '../agencyDataResolver.js';

/**
 * Build NDC 17.2 AirShoppingRQ XML (profile-driven).
 * Supports all NDC 17.2 variants via the airline's builderProfile config.
 *
 * @param {object} params - Search parameters (origin, destination, departureDate, returnDate?, passengers)
 * @param {object} vpData - VP data (used for agency info + VP token)
 * @param {string} airlineCode - IATA airline code
 * @returns {string} NDC 17.2 AirShoppingRQ XML (inner body, SOAP wrapping done by transport)
 */
export const buildAirShopping172RQ = (params, vpData, airlineCode) => {
  validateSearchParams(params);

  const airlineCfg = config.airlines[airlineCode.toLowerCase()] || {};
  const profile = airlineCfg.builderProfile || {};
  const resolved = resolveAgencyData(vpData, airlineCode);

  const rootAttrs = {};

  // Namespace handling: prefixed vs default xmlns
  if (profile.xmlnsPrefix) {
    if (profile.xmlnsPrefixNs5) rootAttrs['@_xmlns:ns5'] = profile.xmlnsPrefixNs5;
    if (profile.xmlnsPrefixPre) rootAttrs['@_xmlns:pre'] = profile.xmlnsPrefixPre;
  } else {
    rootAttrs['@_xmlns'] = profile.defaultXmlns || 'http://www.iata.org/IATA/EDIST/2017.2';
  }

  // Version attribute
  if (profile.versionAttr) {
    rootAttrs['@_Version'] = profile.versionAttr;
  }

  // Language attributes
  if (profile.defaultXmlns) {
    rootAttrs['@_PrimaryLangID'] = 'EN';
    rootAttrs['@_AltLangID'] = 'EN';
  }

  // EchoToken / timestamps (prefixed namespace style)
  if (profile.xmlnsPrefix) {
    const echoToken = String(Math.floor(Math.random() * 100000));
    const timestamp = new Date().toISOString();
    rootAttrs['@_EchoToken'] = echoToken;
    rootAttrs['@_SequenceNmbr'] = '1';
    rootAttrs['@_TimeStamp'] = timestamp;
    rootAttrs['@_TransactionIdentifier'] = echoToken;
    rootAttrs['@_Version'] = profile.versionAttr || '2017.2';
  }

  const requestData = {
    'AirShoppingRQ': {
      ...rootAttrs,
      'Document': buildDocument(profile),
      'Party': buildParty(resolved, airlineCfg, profile),
      'Parameters': buildParameters(params, profile),
      'CoreQuery': {
        'OriginDestinations': {
          'OriginDestination': buildOriginDestinations(params, profile),
        },
      },
    },
  };

  const root = requestData['AirShoppingRQ'];

  // Preference element (profile-driven)
  if (profile.includePreference) {
    root['Preference'] = {
      'FarePreferences': {
        'Types': { 'Type': '759' },
      },
      'CabinPreferences': {
        'CabinType': { 'Code': '5' },
      },
    };
  }

  root['DataLists'] = {
    'PassengerList': {
      'Passenger': buildPassengerList(params.passengers, profile),
    },
  };

  // AugmentationPoint with VP token
  const augmentation = buildAugmentationPoint(resolved, airlineCfg);
  if (augmentation) {
    Object.assign(root, augmentation);
  }

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    format: true,
    suppressEmptyNode: false,
  });

  return builder.build(requestData);
};

/**
 * Validate search parameters
 */
const validateSearchParams = (params) => {
  if (!params.origin) {
    throw new AppError({ statusCode: 400, msg: 'Origin airport code is required' });
  }
  if (!params.destination) {
    throw new AppError({ statusCode: 400, msg: 'Destination airport code is required' });
  }
  if (!params.departureDate) {
    throw new AppError({ statusCode: 400, msg: 'Departure date is required' });
  }
  if (!params.passengers || params.passengers.length === 0) {
    throw new AppError({ statusCode: 400, msg: 'At least one passenger is required' });
  }
};

/**
 * Build Document element (profile-driven)
 */
const buildDocument = (profile) => {
  const doc = {
    'Name': profile.documentName || 'NDC-Exchange',
  };
  if (profile.documentRefVersion) {
    doc['ReferenceVersion'] = profile.documentRefVersion;
  }
  return doc;
};

/**
 * Build Party element (profile-driven).
 * Handles both simple (IATA_Number + AgencyID) and extended (Contacts + Participants) variants.
 */
const buildParty = (resolved, airlineCfg, profile) => {
  const party = {
    'Sender': {
      'TravelAgencySender': {},
    },
  };

  const sender = party['Sender']['TravelAgencySender'];

  // Name (included when contacts/participants are present)
  if (profile.includeContacts || profile.includeParticipants) {
    sender['Name'] = resolved.agencyName;
  }

  // Contacts (profile-driven)
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

  // Participants > AggregatorParticipant (profile-driven)
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

/**
 * Build Parameters element (profile-driven)
 */
const buildParameters = (params, profile) => {
  const parameters = {};

  if (profile.includeLanguages) {
    parameters['Languages'] = {
      'LanguageCode': profile.languageCode || 'en',
    };
  }

  parameters['CurrCodes'] = {
    'CurrCode': params.currency || 'USD',
  };

  return parameters;
};

/**
 * Build OriginDestination elements (profile-driven)
 */
const buildOriginDestinations = (params, profile) => {
  const daysBefore = profile.calendarDaysBefore || '0';
  const daysAfter = profile.calendarDaysAfter || '0';
  const destinations = [];

  // Outbound
  destinations.push({
    'Departure': {
      'AirportCode': params.origin,
      'Date': params.departureDate,
    },
    'Arrival': {
      'AirportCode': params.destination,
    },
    'CalendarDates': {
      '@_DaysAfter': daysAfter,
      '@_DaysBefore': daysBefore,
    },
  });

  // Return leg (round-trip)
  if (params.returnDate) {
    destinations.push({
      'Departure': {
        'AirportCode': params.destination,
        'Date': params.returnDate,
      },
      'Arrival': {
        'AirportCode': params.origin,
      },
      'CalendarDates': {
        '@_DaysAfter': daysAfter,
        '@_DaysBefore': daysBefore,
      },
    });
  }

  return destinations;
};

/**
 * Build PassengerList (profile-driven PaxID format)
 */
const buildPassengerList = (passengers, profile) => {
  const format = profile.paxIdFormat || 'PTC_numeric';

  if (format === 'T_numeric') {
    return passengers.map((pax, idx) => ({
      '@_PassengerID': `T${idx + 1}`,
      'PTC': pax.type || 'ADT',
    }));
  }

  // PTC_numeric: "ADT0", "ADT1", "CHD0"
  const typeCounts = {};
  return passengers.map((pax) => {
    const ptc = pax.type || 'ADT';
    const idx = typeCounts[ptc] || 0;
    typeCounts[ptc] = idx + 1;
    return {
      '@_PassengerID': `${ptc}${idx}`,
      'PTC': ptc,
    };
  });
};

/**
 * Build AugmentationPoint containing the Verifiable Presentation token.
 */
export const buildAugmentationPoint = (resolved, airlineCfg) => {
  // Custom VP token from config takes priority
  const vpToken = airlineCfg.customVpToken || resolved.vpToken;
  if (!vpToken) return null;

  return {
    'AugmentationPoint': {
      'VerifiablePresentation': vpToken,
    },
  };
};
