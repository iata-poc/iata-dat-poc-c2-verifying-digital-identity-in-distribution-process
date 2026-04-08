import { randomUUID } from 'crypto';
import { constants } from '../constants.js';
import { AppError } from '../appError.js';

/**
 * Order Schema:
 * {
 *   orderId: uuid,
 *   verificationId: string,
 *   agentDid: string,
 *   agencyId: string,
 *   agencyIataNumber: string,
 *   ndcOrderId: string,
 *   airlineCode: string,
 *   status: string (PENDING_PAYMENT, CONFIRMED, CANCELLED, FAILED),
 *   bookingReference: string (PNR),
 *   totalPrice: {
 *     total: number,
 *     currency: string,
 *     base: number,
 *     taxes: number
 *   },
 *   passengers: [{
 *     passengerId: string,
 *     type: string,
 *     title: string,
 *     firstName: string,
 *     lastName: string,
 *     dateOfBirth: string,
 *     document: object,
 *     contact: object
 *   }],
 *   segments: [{
 *     flightNumber: string,
 *     departureAirport: string,
 *     departureTime: string,
 *     arrivalAirport: string,
 *     arrivalTime: string,
 *     carrierCode: string
 *   }],
 *   tickets: [{
 *     passengerId: string,
 *     ticketNumber: string,
 *     status: string
 *   }],
 *   createdAt: Date,
 *   updatedAt: Date,
 *   rawNdcResponse: string
 * }
 */

// In-memory store for orders
const orders = [];

/**
 * Add a new order
 * @param {object} order - Order data
 * @returns {string} orderId
 */
const addOrder = (order) => {
  const orderId = order.orderId || randomUUID();
  const now = new Date();

  const newOrder = {
    orderId,
    status: order.status || constants.orderStatuses.PENDING_PAYMENT,
    createdAt: now,
    updatedAt: now,
    ...order,
  };

  orders.push(newOrder);
  
  console.log(`[OrderStore] Created order ${orderId} for airline ${order.airlineCode}`);

  return orderId;
};

/**
 * Get order by ID
 * @param {string} orderId - Order ID
 * @returns {object|undefined} Order (immutable copy)
 */
const getOrder = (orderId) => {
  const order = orders.find((o) => o.orderId === orderId);
  
  if (!order) {
    return undefined;
  }

  // Return immutable copy
  return { ...order };
};

/**
 * Get order by NDC order ID
 * @param {string} ndcOrderId - NDC order ID from airline
 * @param {string} airlineCode - Airline code
 * @returns {object|undefined} Order (immutable copy)
 */
const getOrderByNdcId = (ndcOrderId, airlineCode) => {
  const order = orders.find(
    (o) => o.ndcOrderId === ndcOrderId && o.airlineCode === airlineCode
  );
  
  if (!order) {
    return undefined;
  }

  return { ...order };
};

/**
 * Get order by booking reference (PNR)
 * @param {string} bookingReference - PNR
 * @returns {object|undefined} Order (immutable copy)
 */
const getOrderByPnr = (bookingReference) => {
  const order = orders.find((o) => o.bookingReference === bookingReference);
  
  if (!order) {
    return undefined;
  }

  return { ...order };
};

/**
 * Get orders by verification ID
 * @param {string} verificationId - Verification/session ID
 * @returns {array} Orders (immutable copies)
 */
const getOrdersByVerificationId = (verificationId) => {
  return orders
    .filter((o) => o.verificationId === verificationId)
    .map((o) => ({ ...o }));
};

/**
 * Get orders by agent DID
 * @param {string} agentDid - Agent DID
 * @returns {array} Orders (immutable copies)
 */
const getOrdersByAgent = (agentDid) => {
  return orders
    .filter((o) => o.agentDid === agentDid)
    .map((o) => ({ ...o }));
};

/**
 * Get orders by agency ID
 * @param {string} agencyId - Agency ID
 * @returns {array} Orders (immutable copies)
 */
const getOrdersByAgency = (agencyId) => {
  return orders
    .filter((o) => o.agencyId === agencyId)
    .map((o) => ({ ...o }));
};

/**
 * Update order
 * @param {string} orderId - Order ID
 * @param {object} updates - Updates to apply
 * @returns {boolean} Success
 */
const updateOrder = (orderId, updates) => {
  const index = orders.findIndex((o) => o.orderId === orderId);
  
  if (index === -1) {
    return false;
  }

  orders[index] = {
    ...orders[index],
    ...updates,
    updatedAt: new Date(),
  };

  console.log(`[OrderStore] Updated order ${orderId}`);

  return true;
};

/**
 * Delete order
 * @param {string} orderId - Order ID
 * @returns {boolean} Success
 */
const deleteOrder = (orderId) => {
  const index = orders.findIndex((o) => o.orderId === orderId);
  
  if (index === -1) {
    return false;
  }

  orders.splice(index, 1);
  console.log(`[OrderStore] Deleted order ${orderId}`);

  return true;
};

/**
 * Get all orders (for debugging)
 * @returns {array} All orders
 */
const getAllOrders = () => {
  return orders.map((o) => ({ ...o }));
};

/**
 * Validate that the requesting agent owns the order
 * @param {string} orderId - Order ID
 * @param {object} agentProfile - Agent profile from request
 * @returns {object} Order if valid
 * @throws {AppError} If order not found or ownership mismatch
 */
const validateOrderOwnership = (orderId, agentProfile) => {
  const order = getOrder(orderId);
  
  if (!order) {
    throw new AppError({
      statusCode: 404,
      msg: 'Order not found',
    });
  }

  // If order has no agent binding (legacy), allow access
  if (!order.agentDid) {
    console.warn(`[OrderStore] Order ${orderId} has no agent binding - allowing access`);
    return order;
  }

  // Validate agent DID matches
  const requestingAgentDid = agentProfile?.did;
  
  if (!requestingAgentDid) {
    throw new AppError({
      statusCode: 401,
      msg: 'Agent identity required to access order',
    });
  }

  if (order.agentDid !== requestingAgentDid) {
    console.error(`[OrderStore] Ownership mismatch: order belongs to ${order.agentDid}, requested by ${requestingAgentDid}`);
    throw new AppError({
      statusCode: 403,
      msg: 'You do not have permission to access this order',
    });
  }

  return order;
};

export const orderStore = {
  addOrder,
  getOrder,
  getOrderByNdcId,
  getOrderByPnr,
  getOrdersByVerificationId,
  getOrdersByAgent,
  getOrdersByAgency,
  updateOrder,
  deleteOrder,
  getAllOrders,
  validateOrderOwnership,
};
