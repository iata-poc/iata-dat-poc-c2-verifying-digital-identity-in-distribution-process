import { searchContextStore } from '../stores/searchContextStore.js';
import { orderStore } from '../stores/orderStore.js';
import { convertPriceToUSD } from '../utils/currencyConverter.js';
import { AppError } from '../appError.js';
import { randomUUID } from 'crypto';

/**
 * Look up an offer from search context (shared by both demo helpers)
 */
const resolveOffer = (searchId, offerId) => {
  const searchContext = searchContextStore.getSearchContext(searchId);
  if (!searchContext) {
    throw new AppError({ statusCode: 404, msg: `Search context ${searchId} not found or expired` });
  }
  const offer = searchContext.offers?.find((o) => o.offerId === offerId);
  if (!offer) {
    throw new AppError({ statusCode: 404, msg: `Offer ${offerId} not found in search context` });
  }
  return { searchContext, offer };
};

const mapSegmentsShort = (segments) =>
  segments?.map((seg) => ({
    flightNumber: seg.flightNumber,
    departureAirport: seg.departureAirport,
    departureTime: seg.departureTime,
    arrivalAirport: seg.arrivalAirport,
    arrivalTime: seg.arrivalTime,
    carrierCode: seg.carrierCode,
  })) || [];

const mapPassengers = (passengers) =>
  passengers.map((p, i) => ({
    passengerId: `PAX_${i + 1}`,
    type: p.type || 'ADT',
    firstName: p.firstName,
    lastName: p.lastName,
  }));

/**
 * Build a demo reprice response (price verified, no change)
 */
export const buildDemoRepriceResponse = (searchId, offerId) => {
  const { offer } = resolveOffer(searchId, offerId);
  const priceUSD = convertPriceToUSD(offer.price);

  return {
    offerId,
    airlineCode: offer.airlineCode,
    originalPrice: priceUSD,
    repricedPrice: priceUSD,
    priceChanged: false,
    priceDifference: 0,
    priceIncreased: false,
    priceDecreased: false,
    priceBreakdown: null,
    validity: { timeLimit: new Date(Date.now() + 30 * 60000).toISOString() },
    fareDetails: offer.fareDetails || null,
    fareRestrictions: null,
    segments: offer.segments?.map((seg) => ({
      flightNumber: seg.flightNumber,
      departureAirport: seg.departureAirport,
      departureTime: seg.departureTime,
      departureStation: seg.departureStation || '',
      departureTerminal: seg.departureTerminal || '',
      arrivalAirport: seg.arrivalAirport,
      arrivalTime: seg.arrivalTime,
      arrivalStation: seg.arrivalStation || '',
      arrivalTerminal: seg.arrivalTerminal || '',
      duration: seg.duration,
      carrierCode: seg.carrierCode,
      operatingCarrier: seg.operatingCarrier || seg.carrierCode,
      aircraft: seg.aircraft || '',
      aircraftName: seg.aircraftName || '',
      journeyDirection: seg.journeyDirection || 'outbound',
    })) || [],
  };
};

/**
 * Build a demo order response (confirmed with mock booking ref) and persist it
 * @param {object} opts
 * @param {string} opts.searchId
 * @param {string} opts.offerId
 * @param {Array}  opts.passengers
 * @param {string} [opts.verificationId]  - session / verification id for order store
 * @param {string} [opts.agentDid]
 * @param {string} [opts.agencyId]
 */
export const buildDemoOrderResponse = ({ searchId, offerId, passengers, verificationId, agentDid, agencyId }) => {
  const { offer } = resolveOffer(searchId, offerId);
  const priceUSD = convertPriceToUSD(offer.price);
  const bookingRef = Math.random().toString(36).substring(2, 8).toUpperCase();
  const orderId = randomUUID();
  const ndcOrderId = `NDC-${orderId.substring(0, 8).toUpperCase()}`;
  const mappedPassengers = mapPassengers(passengers);
  const mappedSegments = mapSegmentsShort(offer.segments);

  orderStore.addOrder({
    orderId,
    verificationId: verificationId || 'unknown',
    agentDid,
    agencyId,
    ndcOrderId,
    airlineCode: offer.airlineCode,
    ownerCode: offer.airlineCode,
    status: 'CONFIRMED',
    bookingReference: bookingRef,
    totalPrice: priceUSD,
    passengers: mappedPassengers,
    segments: mappedSegments,
  });

  return {
    orderId,
    ndcOrderId,
    bookingReference: bookingRef,
    airlineCode: offer.airlineCode,
    status: 'CONFIRMED',
    totalPrice: priceUSD,
    passengers: mappedPassengers,
    segments: mappedSegments,
  };
};
