import { XMLParser } from 'fast-xml-parser';
import { AppError } from '../../appError.js';
import { parseOfferPrice172RS } from './offerPrice172Parser.js';

/**
 * Parse NDC OfferPriceRS XML response (auto-detects NDC 21.x vs 17.2)
 *
 * @param {string} xmlResponse - XML response from airline
 * @param {string} airlineCode - IATA airline code
 * @returns {object} Repriced offer with price comparison
 */
export const parseOfferPriceRS = (xmlResponse, airlineCode) => {
  // Detect NDC 17.2 format vs IATA 21.x format
  const is172 = xmlResponse.includes('<OfferPriceRS') && !xmlResponse.includes('<IATA_OfferPriceRS');

  if (is172) {
    console.log(`[OfferPriceParser] Detected NDC 17.2 format for ${airlineCode}, delegating to 17.2 parser`);
    return parseOfferPrice172RS(xmlResponse, airlineCode);
  }

  console.log(`[OfferPriceParser] Detected IATA 21.36 format for ${airlineCode}`);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false, // keep as strings to avoid number truncation
    removeNSPrefix: true,
  });

  let parsedData;
  try {
    parsedData = parser.parse(xmlResponse);
  } catch (error) {
    console.error('[OfferPriceParser] XML parsing error:', error);
    throw new AppError({
      statusCode: 502,
      msg: `Failed to parse ${airlineCode} OfferPrice response: ${error.message}`,
    });
  }

  const response = parsedData.IATA_OfferPriceRS || parsedData;

  // Check for errors in response
  if (response.Error || response.Errors) {
    const errorMsg = extractErrorMessage(response);
    throw new AppError({
      statusCode: 502,
      msg: `${airlineCode} OfferPrice returned error: ${errorMsg}`,
    });
  }

  // Extract repriced offer
  const repricedOffer = extractRepricedOffer(response, airlineCode);

  // Extract OfferPrice ResponseID for OrderCreate (some airlines require this instead of AirShopping's)
  const offerPriceResponseId = response.ShoppingResponseID?.ResponseID ||
    response.Response?.ShoppingResponseID?.ResponseID || null;

  return {
    airlineCode,
    offerId: repricedOffer.offerId,
    price: repricedOffer.price,
    priceBreakdown: repricedOffer.priceBreakdown,
    validity: repricedOffer.validity,
    fareRestrictions: repricedOffer.fareRestrictions,
    ndcReferences: {
      ...repricedOffer.ndcReferences,
      ...(offerPriceResponseId ? { offerPriceResponseId } : {}),
    },
    metadata: {
      timestamp: response.PayloadAttributes?.Timestamp || new Date().toISOString(),
      correlationId: response.PayloadAttributes?.CorrelationID || null,
    },
  };
};

/**
 * Extract error message from response
 */
const extractErrorMessage = (response) => {
  const errors = response.Error || response.Errors?.Error || [];
  const errorArray = Array.isArray(errors) ? errors : [errors];
  if (errorArray.length > 0) {
    const first = errorArray[0];
    return first.DescText || first.ErrorText || first.StatusText || JSON.stringify(first);
  }
  return 'Unknown error';
};

const toArray = (val) => {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
};

/**
 * Parse NDC 21.x amount element: <TotalAmount CurCode="XXX">5760.0</TotalAmount>
 * With parseAttributeValue:false → { '#text': '5760.0', '@_CurCode': 'QAR' } or just '5760.0'
 */
const parseAmount = (amountEl) => {
  if (!amountEl) return { value: 0, currency: 'USD' };
  if (typeof amountEl === 'string' || typeof amountEl === 'number') {
    return { value: parseFloat(amountEl) || 0, currency: 'USD' };
  }
  return {
    value: parseFloat(amountEl['#text'] || amountEl) || 0,
    currency: amountEl['@_CurCode'] || 'USD',
  };
};

/**
 * Extract and normalize repriced offer from NDC 21.x OfferPriceRS
 * Structure: Response > PricedOffer { OfferID, OfferExpirationTimeLimitDateTime,
 *   OfferItem { OfferItemID, Price { TotalAmount, EquivAmount, TaxSummary }, FareDetail },
 *   BaggageAssociations, JourneyOverview, OwnerCode }
 */
const extractRepricedOffer = (response, airlineCode) => {
  const pricedOffer = response.Response?.PricedOffer;
  
  if (!pricedOffer) {
    throw new AppError({
      statusCode: 502,
      msg: `${airlineCode} OfferPrice response missing PricedOffer`,
    });
  }

  const offerId = pricedOffer.OfferID;

  // Extract pricing from OfferItem.Price (NDC 21.x puts total price on OfferItem, not Offer)
  const offerItems = toArray(pricedOffer.OfferItem);
  const firstItem = offerItems[0];
  const itemPrice = firstItem?.Price || {};

  const totalAmount = parseAmount(itemPrice.TotalAmount);
  const equivAmount = parseAmount(itemPrice.EquivAmount || itemPrice.BaseAmount);
  const taxAmount = parseAmount(itemPrice.TaxSummary?.TotalTaxAmount);

  const price = {
    total: totalAmount.value,
    currency: totalAmount.currency,
  };

  // Extract per-pax price breakdown from FareDetail
  const fareDetails = toArray(firstItem?.FareDetail);
  const firstFareDetail = fareDetails[0];
  const fareDetailPrice = firstFareDetail?.Price || {};
  const perPaxTotal = parseAmount(fareDetailPrice.TotalAmount);
  const perPaxBase = parseAmount(fareDetailPrice.EquivAmount || fareDetailPrice.BaseAmount);
  const perPaxTax = parseAmount(fareDetailPrice.TaxSummary?.TotalTaxAmount);

  // Extract individual taxes
  const taxes = toArray(fareDetailPrice.TaxSummary?.Tax).map((tax) => ({
    code: tax.TaxCode || '',
    name: tax.TaxName || '',
    amount: parseAmount(tax.Amount).value,
    currency: parseAmount(tax.Amount).currency,
  }));

  const priceBreakdown = {
    base: equivAmount.value,
    taxes: taxAmount.value,
    perPax: {
      base: perPaxBase.value,
      taxes: perPaxTax.value,
      total: perPaxTotal.value,
    },
    taxDetails: taxes,
  };

  // Extract validity/expiration
  const validity = {
    expiresAt: pricedOffer.OfferExpirationTimeLimitDateTime || null,
  };

  // Extract cancel/change restrictions from FareComponents
  const fareRestrictions = extractFareRestrictions(fareDetails);

  // NDC references for booking
  const ndcReferences = {
    offerId,
    ownerCode: pricedOffer.OwnerCode || airlineCode,
    offerItemIds: offerItems.map((item) => item.OfferItemID).filter(Boolean),
  };

  return {
    offerId,
    price,
    priceBreakdown,
    validity,
    fareRestrictions,
    ndcReferences,
  };
};

/**
 * Extract cancel/change restrictions from NDC 21.x FareDetail > FareComponent
 * Structure: FareComponent > CancelRestrictions[] / ChangeRestrictions[]
 * Each: { AllowedModificationInd, DescText, Fee { Amount CurCode }, JourneyStageCode }
 */
const extractFareRestrictions = (fareDetails) => {
  const result = {
    refundable: false,
    changeable: false,
    cancelRestrictions: [],
    changeRestrictions: [],
  };

  fareDetails.forEach((fd) => {
    toArray(fd.FareComponent).forEach((fc) => {
      toArray(fc.CancelRestrictions).forEach((cr) => {
        const allowed = cr.AllowedModificationInd === 'true' || cr.AllowedModificationInd === true;
        if (allowed && !result.refundable) result.refundable = true;
        const fee = cr.Fee?.Amount;
        result.cancelRestrictions.push({
          allowed,
          description: cr.DescText || '',
          fee: fee ? parseAmount(fee).value : null,
          currency: fee ? parseAmount(fee).currency : null,
          stage: cr.JourneyStageCode || '',
          segment: fc.PaxSegmentRefID || '',
        });
      });

      toArray(fc.ChangeRestrictions).forEach((cr) => {
        const allowed = cr.AllowedModificationInd === 'true' || cr.AllowedModificationInd === true;
        if (allowed && !result.changeable) result.changeable = true;
        const fee = cr.Fee?.Amount;
        result.changeRestrictions.push({
          allowed,
          description: cr.DescText || '',
          fee: fee ? parseAmount(fee).value : null,
          currency: fee ? parseAmount(fee).currency : null,
          stage: cr.JourneyStageCode || '',
          segment: fc.PaxSegmentRefID || '',
        });
      });
    });
  });

  return result;
};

/**
 * Compare repriced offer with original offer
 * @param {object} repricedOffer - Repriced offer from OfferPriceRS
 * @param {object} originalOffer - Original offer from AirShoppingRS
 * @returns {object} Comparison result
 */
export const compareOfferPrices = (repricedOffer, originalOffer) => {
  const originalTotal = originalOffer.price?.total || 0;
  const repricedTotal = repricedOffer.price?.total || 0;
  const originalCurrency = originalOffer.price?.currency || 'USD';
  const repricedCurrency = repricedOffer.price?.currency || 'USD';

  // Only compare numerically when currencies match; different currencies
  // (e.g. USD-converted original vs EUR repriced) are not a real price change.
  const sameCurrency = originalCurrency === repricedCurrency;
  const priceDifference = sameCurrency ? repricedTotal - originalTotal : 0;
  const priceChanged = sameCurrency && Math.abs(priceDifference) > 0.01;

  return {
    priceChanged,
    priceDifference,
    priceIncreased: priceDifference > 0,
    priceDecreased: priceDifference < 0,
    originalPrice: {
      total: originalTotal,
      currency: originalCurrency,
    },
    repricedPrice: {
      total: repricedTotal,
      currency: repricedCurrency,
    },
  };
};
