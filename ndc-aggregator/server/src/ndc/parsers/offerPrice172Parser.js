import { XMLParser } from 'fast-xml-parser';
import { AppError } from '../../appError.js';

/**
 * Parse NDC 17.2 OfferPriceRS XML response
 *
 * NDC 17.2 structure: OfferPriceRS > PricedOffer { Offer { @OfferID, @Owner,
 *   TotalPrice, OfferItem[], BaggageAllowance[] }, AssociatedData }
 *
 * @param {string} xmlResponse - XML response from airline
 * @param {string} airlineCode - IATA airline code
 * @returns {object} Repriced offer with price and NDC references
 */
export const parseOfferPrice172RS = (xmlResponse, airlineCode) => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    removeNSPrefix: true,
  });

  let parsedData;
  try {
    parsedData = parser.parse(xmlResponse);
  } catch (error) {
    console.error('[OfferPrice172Parser] XML parsing error:', error);
    throw new AppError({
      statusCode: 502,
      msg: `Failed to parse ${airlineCode} OfferPrice response: ${error.message}`,
    });
  }

  // NDC 17.2 root: OfferPriceRS (may be wrapped in array by parser)
  let rs = parsedData.OfferPriceRS || parsedData;
  if (Array.isArray(rs)) rs = rs[0];

  // Check for errors
  if (rs.Errors || rs.Error) {
    const errorMsg = extractErrorMessage(rs);
    throw new AppError({
      statusCode: 502,
      msg: `${airlineCode} OfferPrice returned error: ${errorMsg}`,
    });
  }

  // Extract OfferPrice ResponseID — some variants require this (not AirShopping's) in OrderCreate
  const offerPriceResponseId = rs.ShoppingResponseID?.ResponseID || null;

  const repricedOffer = extractRepricedOffer172(rs, airlineCode);

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
      timestamp: rs['@_TimeStamp'] || new Date().toISOString(),
      transactionId: rs['@_TransactionIdentifier'] || null,
    },
  };
};

// ── Helpers ──

const toArray = (val) => {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
};

const extractErrorMessage = (rs) => {
  const errors = rs.Errors?.Error || rs.Error || [];
  const arr = Array.isArray(errors) ? errors : [errors];
  if (arr.length > 0) {
    const first = arr[0];
    return first['#text'] || first.ShortText || first.DescText || JSON.stringify(first);
  }
  return 'Unknown error';
};

/**
 * Parse NDC 17.2 amount element:
 *   <Total Code="CAD">1234.56</Total>  →  { value: 1234.56, currency: 'CAD' }
 *   or plain string/number
 */
const parseAmount172 = (el) => {
  if (!el) return { value: 0, currency: 'USD' };
  if (typeof el === 'string' || typeof el === 'number') {
    return { value: parseFloat(el) || 0, currency: 'USD' };
  }
  return {
    value: parseFloat(el['#text'] || el) || 0,
    currency: el['@_Code'] || el['@_CurCode'] || 'USD',
  };
};

/**
 * Extract repriced offer from NDC 17.2 OfferPriceRS
 *
 * NDC 17.2 structure: PricedOffer (or OffersGroup > AirlineOffers > AirlineOffer > PricedOffer)
 * contains Offer with same shape as AirShoppingRS offers.
 */
const extractRepricedOffer172 = (rs, airlineCode) => {
  // Try multiple known locations for the priced offer
  let offer =
    rs.PricedOffer?.Offer ||
    rs.OffersGroup?.AirlineOffers?.AirlineOffer?.PricedOffer?.Offer ||
    rs.OffersGroup?.AirlineOffers?.Offer ||
    rs.PricedOffer ||
    null;

  // Some implementations put it directly under Response
  if (!offer && rs.Response) {
    offer =
      rs.Response?.PricedOffer?.Offer ||
      rs.Response?.OffersGroup?.AirlineOffers?.AirlineOffer?.PricedOffer?.Offer ||
      rs.Response?.PricedOffer ||
      null;
  }

  if (!offer) {
    throw new AppError({
      statusCode: 502,
      msg: `${airlineCode} OfferPrice response missing PricedOffer/Offer`,
    });
  }

  // If the offer is the wrapper PricedOffer itself, unwrap
  if (!offer['@_OfferID'] && offer.Offer) {
    offer = offer.Offer;
  }

  const offerId = offer['@_OfferID'] || '';
  const ownerCode = offer['@_Owner'] || airlineCode;

  // ── Total price ──
  // Variant A uses DetailCurrencyPrice > Total[@Code]; Variant B uses SimpleCurrencyPrice[@Code]
  const totalPriceNode = offer.TotalPrice?.DetailCurrencyPrice;
  const simplePriceNode = offer.TotalPrice?.SimpleCurrencyPrice;
  let totalAmount;
  if (totalPriceNode) {
    totalAmount = parseAmount172(totalPriceNode.Total);
  } else if (simplePriceNode) {
    totalAmount = parseAmount172(simplePriceNode);
  } else {
    totalAmount = { value: 0, currency: 'USD' };
  }

  const price = {
    total: totalAmount.value,
    currency: totalAmount.currency,
  };

  // ── Price breakdown from OfferItem ──
  const offerItems = toArray(offer.OfferItem);
  const firstItem = offerItems[0];
  // Variant A: TotalPriceDetail > BaseAmount, Taxes; Variant B: FareDetail > Price > BaseAmount, Taxes
  const itemPrice = firstItem?.TotalPriceDetail || {};
  const fareDetailPrice = toArray(firstItem?.FareDetail)?.[0]?.Price || {};

  const baseAmount = parseAmount172(itemPrice.BaseAmount || fareDetailPrice.BaseAmount);
  const taxAmount = parseAmount172(itemPrice.Taxes?.Total || fareDetailPrice.Taxes?.Total);

  const priceBreakdown = {
    base: baseAmount.value,
    taxes: taxAmount.value,
    perPax: {
      base: baseAmount.value,
      taxes: taxAmount.value,
      total: totalAmount.value,
    },
    taxDetails: [], // NDC 17.2 typically doesn't provide per-tax breakdown in OfferPrice
  };

  // ── Validity ──
  const validity = {
    expiresAt: offer.TimeLimits?.OtherLimits?.OtherLimit?.TicketByTimeLimit?.TicketBy ||
      offer.OfferExpirationDateTime ||
      offer.PaymentTimeLimitDateTime ||
      null,
  };

  // ── Fare restrictions from FareComponent.FareRules.Penalty ──
  const fareComponents = [];
  offerItems.forEach((item) => {
    toArray(item.FareDetail).forEach((fd) => {
      toArray(fd.FareComponent).forEach((fc) => fareComponents.push(fc));
    });
  });

  const fareRestrictions = extractFareRestrictions172(fareComponents);

  // ── NDC references (updated from repriced response) ──
  const ndcReferences = {
    offerId,
    ownerCode,
    offerItemIds: offerItems.map((item) => item['@_OfferItemID']).filter(Boolean),
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
 * Extract fare restrictions from NDC 17.2 FareComponent > FareRules > Penalty
 * Uses same PriceClass description approach when available, with Penalty details for fees.
 */
const extractFareRestrictions172 = (fareComponents) => {
  const result = {
    refundable: false,
    changeable: false,
    cancelRestrictions: [],
    changeRestrictions: [],
  };

  fareComponents.forEach((fc) => {
    toArray(fc.FareRules?.Penalty).forEach((penalty) => {
      if (penalty['@_RefundableInd'] === 'true') result.refundable = true;
      if (penalty['@_ChangeFeeInd'] === 'false' && penalty['@_RefundableInd'] === 'true') {
        // ChangeFeeInd=false + RefundableInd=true → free changes (higher tier)
        result.changeable = true;
      }
      if (penalty['@_ChangeFeeInd'] === 'true') {
        result.changeable = true;
      }

      toArray(penalty.Details?.Detail).forEach((detail) => {
        const type = (detail.Type || '').toLowerCase();
        const amounts = toArray(detail.Amounts?.Amount);
        const maxAmount = amounts.find((a) => a.AmountApplication === 'MAX');
        const fee = maxAmount?.CurrencyAmountValue?.['#text'] || maxAmount?.CurrencyAmountValue || null;
        const currency = maxAmount?.CurrencyAmountValue?.['@_Code'] || null;

        if (type === 'change') {
          result.changeRestrictions.push({
            allowed: result.changeable,
            description: '',
            fee: fee ? parseFloat(fee) : null,
            currency,
            stage: detail.Application || '',
          });
        } else if (type === 'cancel') {
          result.cancelRestrictions.push({
            allowed: result.refundable,
            description: '',
            fee: fee ? parseFloat(fee) : null,
            currency,
            stage: detail.Application || '',
          });
        }
      });
    });
  });

  return result;
};
