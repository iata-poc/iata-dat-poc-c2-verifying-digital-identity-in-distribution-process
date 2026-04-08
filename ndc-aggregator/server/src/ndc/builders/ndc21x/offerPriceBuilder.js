import { XMLBuilder } from 'fast-xml-parser';
import { randomUUID } from 'crypto';
import { constants } from '../../../constants.js';
import { AppError } from '../../../appError.js';
import { config } from '../../../config.js';
import { resolveAgencyData } from '../agencyDataResolver.js';
import { buildDistributionChain } from './airShoppingBuilder.js';

/**
 * Build NDC 21.x OfferPriceRQ XML (profile-driven).
 * Supports all NDC 21.x variants via the airline's builderProfile and distributionChain config.
 *
 * @param {object} offerData - Offer data with NDC references
 * @param {object} vpData - VP data for DistributionChain injection
 * @param {string} airlineCode - IATA airline code
 * @returns {string} NDC 21.x OfferPriceRQ XML
 */
export const buildOfferPrice21xRQ = (offerData, vpData, airlineCode) => {
  validateOfferData(offerData);

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

  // Request element
  root['n1:Request'] = {};

  // DataLists > PaxList (profile-driven)
  if (profile.includePaxListInOfferPrice) {
    const paxIds = offerData.paxIds || offerData.ndcReferences?.paxIds || ['PAX1'];
    root['n1:Request']['cns:DataLists'] = {
      'cns:PaxList': {
        'cns:Pax': paxIds.map((paxId) => ({
          'cns:PaxID': paxId,
          'cns:PTC': constants.passengerTypes.ADT.code,
        })),
      },
    };
  }

  root['n1:Request']['cns:PricedOffer'] = buildPricedOffer(offerData, airlineCode);

  const requestData = {
    'n1:IATA_OfferPriceRQ': root,
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
 * Validate offer data contains required NDC references
 */
const validateOfferData = (offerData) => {
  if (!offerData) {
    throw new AppError({ statusCode: 400, msg: 'Offer data is required' });
  }
  if (!offerData.ndcReferences?.offerId) {
    throw new AppError({ statusCode: 400, msg: 'Offer ID is required for repricing' });
  }
  if (!offerData.ndcReferences?.offerItemIds || offerData.ndcReferences.offerItemIds.length === 0) {
    throw new AppError({ statusCode: 400, msg: 'Offer item IDs are required for repricing' });
  }
};

/**
 * Build PricedOffer element (NDC 21.x)
 */
const buildPricedOffer = (offerData, airlineCode) => {
  const ndcRefs = offerData.ndcReferences;
  const paxRefIds = offerData.paxIds || ndcRefs.paxIds || [];

  const selectedOfferItems = buildSelectedOfferItems(ndcRefs, paxRefIds);

  return {
    'cns:SelectedOfferList': {
      'cns:SelectedOffer': {
        'cns:OfferRefID': ndcRefs.offerId,
        'cns:OwnerCode': ndcRefs.ownerCode || airlineCode,
        'cns:SelectedOfferItem': selectedOfferItems.length === 1 ? selectedOfferItems[0] : selectedOfferItems,
      },
    },
  };
};

/**
 * Build SelectedOfferItem array from ndcReferences.
 * Uses per-item pax mapping from parser when available,
 * falls back to 1:1 index mapping or all pax on first item.
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

  const item = { 'cns:OfferItemRefID': ndcRefs.offerItemIds[0] };
  if (paxRefIds.length > 0) item['cns:PaxRefID'] = paxRefIds;
  return [item];
};
