import { searchContextStore } from '../stores/searchContextStore.js';
import { ndcAggregatorService } from './ndcAggregatorService.js';
import { buildOfferPriceForAirline } from '../ndc/builders/index.js';
import { parseOfferPriceRS, compareOfferPrices } from '../ndc/parsers/offerPriceParser.js';
import { AppError } from '../appError.js';

/**
 * Reprice an offer from search results
 * @param {string} searchId - Search context ID
 * @param {string} offerId - Offer ID to reprice
 * @param {object} vpData - VP data for NDC request
 * @returns {Promise<object>} Repriced offer with comparison
 */
export const repriceOffer = async (searchId, offerId, vpData) => {
  console.log(`[RepricingService] Repricing offer ${offerId} from search ${searchId}`);

  // Validate ownership and retrieve search context
  const searchContext = searchContextStore.validateContextOwnership(searchId, vpData?.agentProfile);

  // Find the offer in search context
  const originalOffer = searchContext.offers?.find((o) => o.offerId === offerId);
  
  if (!originalOffer) {
    throw new AppError({
      statusCode: 404,
      msg: `Offer ${offerId} not found in search context`,
    });
  }

  // Extract airline code from offer
  const airlineCode = originalOffer.airlineCode;
  
  if (!airlineCode) {
    throw new AppError({
      statusCode: 400,
      msg: 'Offer missing airline code',
    });
  }

  // Debug: log offer expiration info
  const now = new Date();
  const expiresAt = originalOffer.expiresAt ? new Date(originalOffer.expiresAt) : null;
  const isExpired = expiresAt && expiresAt < now;
  console.log(`[RepricingService] Offer ${offerId} for ${airlineCode}:`, {
    expiresAt: originalOffer.expiresAt || 'not set',
    now: now.toISOString(),
    isExpired,
    minutesRemaining: expiresAt ? Math.round((expiresAt - now) / 60000) : 'unknown',
    searchCreatedAt: searchContext.createdAt || 'unknown',
  });

  console.log(`[RepricingService] Routing reprice to airline: ${airlineCode}`);

  // Prepare offer data with NDC references + paxIds
  const paxIds = searchContext.offers
    ?.filter((o) => o.airlineCode === airlineCode)
    ?.flatMap((o) => o.ndcReferences?.paxIds || [])
    || [];
  // Fallback: generate PAX_1..PAX_N from search params
  const fallbackPaxIds = (searchContext.searchParams?.passengers || [{ type: 'ADT' }])
    .map((_, idx) => `PAX_${idx + 1}`);

  const offerData = {
    ndcReferences: originalOffer.ndcReferences,
    shoppingResponseId: searchContext.ndcRefs?.airlines?.[airlineCode]?.shoppingResponseId,
    paxIds: paxIds.length > 0 ? [...new Set(paxIds)] : fallbackPaxIds,
  };

  // Execute OfferPrice via aggregator (routes to specific airline)
  let repricingResult;
  try {
    repricingResult = await ndcAggregatorService.executeOfferPrice(
      airlineCode,
      buildOfferPriceForAirline,
      offerData,
      vpData
    );
  } catch (error) {
    console.error(`[RepricingService] Repricing failed for ${airlineCode}:`, error.message);
    throw new AppError({
      statusCode: error.statusCode || 502,
      msg: `Repricing failed: ${error.message}`,
    });
  }

  // Parse response
  const repricedOffer = parseOfferPriceRS(repricingResult.response, airlineCode);

  console.log(`[RepricingService] Repricing successful for ${airlineCode}, offerId: ${offerId}`, {
    repricedPrice: repricedOffer.price,
    validity: repricedOffer.validity,
    newNdcRefs: Object.keys(repricedOffer.ndcReferences || {}),
  });

  // Compare prices
  const priceComparison = compareOfferPrices(repricedOffer, originalOffer);

  if (priceComparison.priceChanged) {
    console.log(`[RepricingService] Price changed: ${priceComparison.priceDifference > 0 ? '+' : ''}${priceComparison.priceDifference} ${repricedOffer.price.currency}`);
  }

  // Update search context with repriced offer
  const updatedOffers = searchContext.offers.map((offer) => {
    if (offer.offerId === offerId) {
      return {
        ...offer,
        repricedAt: new Date(),
        repricedPrice: repricedOffer.price,
        repricedPriceBreakdown: repricedOffer.priceBreakdown,
        priceChanged: priceComparison.priceChanged,
        ndcReferences: {
          ...offer.ndcReferences,
          ...repricedOffer.ndcReferences,
        },
      };
    }
    return offer;
  });

  searchContextStore.updateSearchContext(searchId, {
    offers: updatedOffers,
  });

  // Return repricing result
  return {
    offerId,
    airlineCode,
    originalPrice: priceComparison.originalPrice,
    repricedPrice: priceComparison.repricedPrice,
    priceChanged: priceComparison.priceChanged,
    priceDifference: priceComparison.priceDifference,
    priceIncreased: priceComparison.priceIncreased,
    priceDecreased: priceComparison.priceDecreased,
    priceBreakdown: repricedOffer.priceBreakdown,
    validity: repricedOffer.validity,
    fareRestrictions: repricedOffer.fareRestrictions || null,
    ndcReferences: repricedOffer.ndcReferences,
  };
};
