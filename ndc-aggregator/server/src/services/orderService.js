import { searchContextStore } from '../stores/searchContextStore.js';
import { orderStore } from '../stores/orderStore.js';
import { ndcAggregatorService } from './ndcAggregatorService.js';
import { buildOrderCreateForAirline } from '../ndc/builders/index.js';
import { parseOrderViewRS } from '../ndc/parsers/orderViewParser.js';
import { AppError } from '../appError.js';
import { constants } from '../constants.js';

/**
 * Create an order from a selected offer
 * @param {string} searchId - Search context ID
 * @param {string} offerId - Selected offer ID
 * @param {object} orderRequest - Order request with passenger details
 * @param {object} vpData - VP data for NDC request
 * @returns {Promise<object>} Created order
 */
export const createOrder = async (searchId, offerId, orderRequest, vpData) => {
  console.log(`[OrderService] Creating order for offer ${offerId} from search ${searchId}`);

  // Validate ownership and retrieve search context
  const searchContext = searchContextStore.validateContextOwnership(searchId, vpData?.agentProfile);

  // Find the offer in search context
  const offer = searchContext.offers?.find((o) => o.offerId === offerId);
  
  if (!offer) {
    throw new AppError({
      statusCode: 404,
      msg: `Offer ${offerId} not found in search context`,
    });
  }

  // Extract airline code from offer
  const airlineCode = offer.airlineCode;
  
  if (!airlineCode) {
    throw new AppError({
      statusCode: 400,
      msg: 'Offer missing airline code',
    });
  }

  // Debug: log offer expiration and reprice info
  const now = new Date();
  const expiresAt = offer.expiresAt ? new Date(offer.expiresAt) : null;
  const isExpired = expiresAt && expiresAt < now;
  console.log(`[OrderService] Offer ${offerId} for ${airlineCode}:`, {
    expiresAt: offer.expiresAt || 'not set',
    repricedAt: offer.repricedAt || 'not repriced',
    repricedPrice: offer.repricedPrice || null,
    priceChanged: offer.priceChanged ?? 'n/a',
    now: now.toISOString(),
    isExpired,
    minutesRemaining: expiresAt ? Math.round((expiresAt - now) / 60000) : 'unknown',
  });

  console.log(`[OrderService] Routing order creation to airline: ${airlineCode}`);

  // Prepare offer data with NDC references
  // Some airlines require ResponseID from OfferPrice response, not AirShopping response
  const airShoppingResponseId = searchContext.ndcRefs?.airlines?.[airlineCode]?.shoppingResponseId;
  const offerPriceResponseId = offer.ndcReferences?.offerPriceResponseId;

  const offerData = {
    ndcReferences: offer.ndcReferences,
    shoppingResponseId: offerPriceResponseId || airShoppingResponseId,
    price: offer.repricedPrice || offer.price,  // prefer OfferPrice original currency (e.g. CAD)
  };

  // ── Demo pax expansion ──
  // The frontend only collects one passenger's info, but the offer may require
  // multiple pax (e.g. 2-ADT search). Clone the first passenger to fill the gap.
  let passengers = orderRequest.passengers || [];
  const expectedPaxCount = offer.ndcReferences?.paxIds?.length || passengers.length;
  if (passengers.length > 0 && passengers.length < expectedPaxCount) {
    console.log(`[OrderService] Demo mode: expanding ${passengers.length} passenger(s) to ${expectedPaxCount} (cloning first passenger)`);
    const template = passengers[0];
    while (passengers.length < expectedPaxCount) {
      passengers.push({ ...template });
    }
  }

  // Execute OrderCreate via aggregator (routes to specific airline)
  let orderResult;
  try {
    orderResult = await ndcAggregatorService.executeOrderCreate(
      airlineCode,
      buildOrderCreateForAirline,
      { ...offerData, passengers, payment: orderRequest.payment },
      vpData
    );
  } catch (error) {
    console.error(`[OrderService] Order creation failed for ${airlineCode}:`, error.message);
    throw new AppError({
      statusCode: error.statusCode || 502,
      msg: `Order creation failed: ${error.message}`,
    });
  }

  // Parse response
  const parsedOrder = parseOrderViewRS(orderResult.response, airlineCode);
  const orderDetails = parsedOrder.order;

  console.log(`[OrderService] Order created successfully: ${orderDetails.ndcOrderId}`);

  // Store order in order store
  const orderId = orderStore.addOrder({
    verificationId: searchContext.verificationId,
    agentDid: vpData?.agentProfile?.did,
    agencyId: vpData?.agentProfile?.agency?.id,
    agencyIataNumber: vpData?.agentProfile?.agency?.iataNumber,
    ndcOrderId: orderDetails.ndcOrderId,
    airlineCode,
    ownerCode: orderDetails.ownerCode || airlineCode,
    status: orderDetails.status || constants.orderStatuses.CONFIRMED,
    bookingReference: orderDetails.bookingReference,
    totalPrice: orderDetails.totalPrice,
    paymentTimeLimit: orderDetails.paymentTimeLimit,
    passengers: orderDetails.passengers,
    segments: orderDetails.segments,
    createdAt: orderDetails.createdAt,
    rawNdcResponse: orderResult.response,
  });

  // Return order details
  return {
    orderId,
    ndcOrderId: orderDetails.ndcOrderId,
    bookingReference: orderDetails.bookingReference,
    airlineCode,
    status: orderDetails.status,
    totalPrice: orderDetails.totalPrice,
    paymentTimeLimit: orderDetails.paymentTimeLimit,
    passengers: orderDetails.passengers,
    segments: orderDetails.segments,
  };
};

/**
 * Get order by ID with ownership validation
 * @param {string} orderId - Order ID
 * @param {object} agentProfile - Agent profile for ownership validation
 * @returns {object} Order details
 */
export const getOrder = (orderId, agentProfile) => {
  console.log(`[OrderService] Retrieving order ${orderId}`);

  // Validate ownership and return order
  const order = orderStore.validateOrderOwnership(orderId, agentProfile);

  return order;
};

/**
 * Get orders by verification ID
 * @param {string} verificationId - Verification/session ID
 * @returns {array} Orders
 */
export const getOrdersBySession = (verificationId) => {
  console.log(`[OrderService] Retrieving orders for session ${verificationId}`);

  const orders = orderStore.getOrdersByVerificationId(verificationId);
  
  return orders;
};

/**
 * Get orders by agent DID
 * @param {string} agentDid - Agent DID
 * @returns {array} Orders
 */
export const getOrdersByAgent = (agentDid) => {
  console.log(`[OrderService] Retrieving orders for agent ${agentDid}`);

  const orders = orderStore.getOrdersByAgent(agentDid);
  
  return orders;
};
