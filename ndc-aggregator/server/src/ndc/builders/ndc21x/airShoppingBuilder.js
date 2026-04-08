import { XMLBuilder } from 'fast-xml-parser';
import { randomUUID } from 'crypto';
import { constants } from '../../../constants.js';
import { AppError } from '../../../appError.js';
import { config } from '../../../config.js';
import { resolveAgencyData } from '../agencyDataResolver.js';

/**
 * Build NDC 21.x AirShoppingRQ XML (profile-driven).
 * Supports all NDC 21.x variants via the airline's builderProfile and distributionChain config.
 *
 * @param {object} params - Search parameters (origin, destination, departureDate, returnDate?, passengers)
 * @param {object} vpData - VP data for DistributionChain injection
 * @param {string} airlineCode - IATA airline code
 * @returns {string} NDC 21.x AirShoppingRQ XML
 */
export const buildAirShopping21xRQ = (params, vpData, airlineCode) => {
  validateSearchParams(params);

  const airlineCfg = config.airlines[airlineCode.toLowerCase()] || {};
  const profile = airlineCfg.builderProfile || {};
  const resolved = resolveAgencyData(vpData, airlineCode);
  const requestId = randomUUID();

  const rootAttrs = {
    '@_xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
    '@_xmlns:n1': 'http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage',
    '@_xmlns:cns': 'http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes',
  };

  // Some profiles include extra namespace and schemaLocation
  if (profile.includeSchemaLocation) {
    rootAttrs['@_xmlns:n2'] = 'http://www.altova.com/samplexml/other-namespace';
    rootAttrs['@_xsi:schemaLocation'] = 'http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage.xsd';
  }

  const requestData = {
    'n1:IATA_AirShoppingRQ': {
      ...rootAttrs,
      'n1:DistributionChain': buildDistributionChain(vpData, airlineCode),
    },
  };

  const root = requestData['n1:IATA_AirShoppingRQ'];

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
  } else {
    // Minimal payload attributes (just version)
    root['n1:PayloadAttributes'] = {
      'cns:VersionNumber': profile.versionNumber || '21.3',
    };
  }

  // POS element (profile-driven)
  if (profile.includePOS) {
    root['n1:POS'] = {
      'cns:Country': {
        'cns:CountryCode': airlineCfg.posCountryCode || '',
      },
    };
  }

  // Request element
  root['n1:Request'] = {};

  // FlightRelatedCriteria with CarrierCriteria (profile-driven)
  if (profile.includeCarrierCriteria) {
    root['n1:Request']['cns:FlightRelatedCriteria'] = {
      'cns:CarrierCriteria': {
        'cns:Carrier': {
          'cns:AirlineDesigCode': airlineCode,
        },
      },
    };
  }

  root['n1:Request']['cns:FlightRequest'] = {
    'cns:FlightRequestOriginDestinationsCriteria': {
      'cns:OriginDestCriteria': buildOriginDestCriteria(params, profile),
    },
  };

  root['n1:Request']['cns:PaxList'] = buildPaxList(params.passengers, profile);

  // ResponseParameters — profile-driven
  if (profile.includeCurParameter) {
    root['n1:Request']['cns:ResponseParameters'] = {
      'cns:CurParameter': {
        'cns:CurCode': params.currency || 'USD',
      },
    };
  } else if (profile.includeLangUsage) {
    root['n1:Request']['cns:ResponseParameters'] = {
      'cns:LangUsage': {
        'cns:LangCode': 'EN',
      },
    };
  }

  // Build XML
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    format: true,
    suppressEmptyNode: true,
  });

  const xml = builder.build(requestData);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
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
 * Build OriginDestCriteria (profile-driven)
 */
const buildOriginDestCriteria = (params, profile) => {
  const cabinTypeCodes = profile.cabinTypeCodes || ['2', '3'];
  const criteria = [];

  const buildCabinTypes = () => {
    if (cabinTypeCodes.length === 1) {
      return {
        'cns:CabinTypeCode': cabinTypeCodes[0],
        'cns:PrefLevel': { 'cns:PrefLevelCode': 'Preferred' },
      };
    }
    return cabinTypeCodes.map((code) => ({
      'cns:CabinTypeCode': code,
      'cns:PrefLevel': { 'cns:PrefLevelCode': 'Preferred' },
    }));
  };

  // Outbound leg
  const outbound = {
    'cns:CabinType': buildCabinTypes(),
    'cns:DestArrivalCriteria': {
      'cns:IATA_LocationCode': params.destination,
    },
    'cns:OriginDepCriteria': {
      'cns:Date': params.departureDate,
      'cns:IATA_LocationCode': params.origin,
    },
  };
  if (profile.includeOriginDestId) {
    outbound['cns:OriginDestID'] = 'OD1';
  }
  criteria.push(outbound);

  // Return leg (round-trip)
  if (params.returnDate) {
    const inbound = {
      'cns:CabinType': buildCabinTypes(),
      'cns:DestArrivalCriteria': {
        'cns:IATA_LocationCode': params.origin,
      },
      'cns:OriginDepCriteria': {
        'cns:Date': params.returnDate,
        'cns:IATA_LocationCode': params.destination,
      },
    };
    if (profile.includeOriginDestId) {
      inbound['cns:OriginDestID'] = 'OD2';
    }
    criteria.push(inbound);
  }

  return criteria;
};

/**
 * Build PaxList (profile-driven PaxID format)
 */
const buildPaxList = (passengers, profile) => {
  const paxList = { 'cns:Pax': [] };
  const format = profile.paxIdFormat || 'numeric';

  passengers.forEach((passenger, index) => {
    const ptc = passenger.type || constants.passengerTypes.ADT.code;
    const paxId = formatPaxId(format, index);

    paxList['cns:Pax'].push({
      'cns:PaxID': paxId,
      'cns:PTC': ptc,
    });
  });

  return paxList;
};

/**
 * Format PaxID based on profile format string.
 * - 'numeric': "1", "2"
 * - 'PAX_numeric': "PAX1", "PAX2"
 * - 'PAX_underscore_numeric': "PAX_1", "PAX_2"
 */
export const formatPaxId = (format, index) => {
  switch (format) {
    case 'PAX_numeric': return `PAX${index + 1}`;
    case 'PAX_underscore_numeric': return `PAX_${index + 1}`;
    default: return `${index + 1}`;
  }
};

/**
 * Build DistributionChain with VP injection (profile-driven).
 * Supports 2-link (seller + carrier) and 3-link (seller + distributor + carrier) patterns.
 * VP format: 'text' (plain string) or 'structured' ({ VP_Token, Issuer_DID }).
 */
export const buildDistributionChain = (vpData, airlineCode) => {
  const airlineCfg = config.airlines[airlineCode.toLowerCase()] || {};
  const dcConfig = airlineCfg.distributionChain || {};
  const resolved = resolveAgencyData(vpData, airlineCode);

  const distributionChain = {
    'cns:DistributionChainLink': [],
  };

  // Seller link
  const sellerOrg = {};
  if (dcConfig.sellerIncludeName) {
    sellerOrg['cns:Name'] = resolved.agencyName;
  }
  sellerOrg['cns:OrgID'] = resolved.iataNumber;

  const sellerLink = {
    'cns:Ordinal': '1',
    'cns:OrgRole': 'Seller',
    'cns:ParticipatingOrg': sellerOrg,
  };

  if (dcConfig.sellerIncludeSalesBranch) {
    sellerLink['cns:SalesBranch'] = {
      'cns:SalesBranchID': resolved.agencyId?.substring(0, 10) || '',
    };
  }

  // VP injection
  if (resolved.vpToken) {
    if (dcConfig.vpFormat === 'structured') {
      sellerLink['cns:VerifiablePresentation'] = {
        'cns:VP_Token': resolved.vpToken,
        'cns:Issuer_DID': resolved.did || '',
      };
    } else {
      sellerLink['cns:VerifiablePresentation'] = resolved.vpToken;
    }
  }

  distributionChain['cns:DistributionChainLink'].push(sellerLink);

  // Distributor link (optional, profile-driven)
  const links = dcConfig.links || ['seller', 'carrier'];
  if (links.includes('distributor')) {
    distributionChain['cns:DistributionChainLink'].push({
      'cns:Ordinal': '2',
      'cns:OrgRole': 'Distributor',
      'cns:ParticipatingOrg': {
        'cns:OrgID': resolved.agencyId || '',
      },
    });
  }

  // Carrier link
  const carrierOrdinal = links.includes('distributor') ? '3' : '2';
  distributionChain['cns:DistributionChainLink'].push({
    'cns:Ordinal': carrierOrdinal,
    'cns:OrgRole': 'Carrier',
    'cns:ParticipatingOrg': {
      ...(dcConfig.sellerIncludeName ? { 'cns:Name': dcConfig.carrierName || '' } : {}),
      'cns:OrgID': airlineCode,
    },
  });

  return distributionChain;
};
