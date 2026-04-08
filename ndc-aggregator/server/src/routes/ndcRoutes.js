import express from 'express';
import { hybridAuthenticator, verificationIdAuthenticator } from '../middlewares/authMiddleware.js';
import { ndcAggregatorService } from '../services/ndcAggregatorService.js';
import { buildAirShoppingForAirline } from '../ndc/builders/index.js';
import { parseAirShoppingRS, filterOffers } from '../ndc/parsers/airShoppingParser.js';
import { searchContextStore } from '../stores/searchContextStore.js';
import { repriceOffer } from '../services/repricingService.js';
import { createOrder, getOrder, getOrdersBySession } from '../services/orderService.js';
import { AppError } from '../appError.js';
import { config } from '../config.js';
import { convertOffersToUSD, convertPriceToUSD } from '../utils/currencyConverter.js';
import { buildDemoRepriceResponse, buildDemoOrderResponse } from '../services/demoResponses.js';

const asyncHandler = (func) => (req, res, next) => {
  Promise.resolve(func(req, res, next)).catch(next);
};

/**
 * Expand passengers by count
 * Converts: [{type: "ADT", count: 2}, {type: "CHD", count: 1}]
 * To: [{type: "ADT"}, {type: "ADT"}, {type: "CHD"}]
 * Also handles already-expanded format: [{type: "ADT"}, {type: "ADT"}]
 */
const expandPassengersByCount = (passengers) => {
  const expanded = [];
  
  for (const pax of passengers) {
    const count = pax.count || 1;
    for (let i = 0; i < count; i++) {
      expanded.push({
        type: pax.type || 'ADT',
      });
    }
  }
  
  return expanded;
};

const ndcRouter = express.Router();

// Demo mode: add 1-second delay to all endpoints
if (config.demoMode) {
  ndcRouter.use((req, res, next) => {
    setTimeout(next, 1000);
  });
}

/**
 * POST /shopping/air
 * Search for air offers (one-way and round-trip)
 * Supports stateful (X-Verification-Id) and agency token (X-Agency-Token) auth
 */
ndcRouter.post(
  '/shopping/air',
  hybridAuthenticator,
  asyncHandler(async (req, res) => {
    const searchParams = req.body;

    console.log('[POST /shopping/air] Search request:', {
      origin: searchParams.origin,
      destination: searchParams.destination,
      departureDate: searchParams.departureDate,
      returnDate: searchParams.returnDate || null,
      tripType: searchParams.returnDate ? 'ROUND_TRIP' : 'ONE_WAY',
      passengers: searchParams.passengers?.length,
    });

    // Validate required fields
    if (!searchParams.origin || !searchParams.destination || !searchParams.departureDate) {
      throw new AppError({
        statusCode: 400,
        msg: 'Missing required fields: origin, destination, departureDate',
      });
    }

    if (!searchParams.passengers || searchParams.passengers.length === 0) {
      throw new AppError({
        statusCode: 400,
        msg: 'At least one passenger is required',
      });
    }

    // Expand passengers by count if count is provided
    const expandedPassengers = expandPassengersByCount(searchParams.passengers);
    searchParams.passengers = expandedPassengers;

    // Extract VP data from authenticated request
    const vpData = {
      vpToken: req.vpToken,
      agentProfile: req.agentProfile,
      txId: req.vpTxId || null,
    };

    // Execute air shopping via aggregator
    const results = await ndcAggregatorService.executeAirShopping(
      buildAirShoppingForAirline,
      searchParams,
      vpData
    );

    console.log(`[POST /shopping/air] Received ${results.length} airline responses`);

    // Parse and aggregate offers from all airlines
    const allOffers = [];
    const ndcRefs = {
      airlines: {},
    };

    for (const result of results) {
      if (result.success) {
        try {
          const parsed = parseAirShoppingRS(result.response, result.airlineCode);
          
          console.log(`[POST /shopping/air] ${result.airlineCode}: ${parsed.offers.length} offers parsed`);
          allOffers.push(...parsed.offers);
          
          ndcRefs.airlines[result.airlineCode] = {
            shoppingResponseId: parsed.shoppingResponseId,
            timestamp: parsed.metadata.timestamp,
          };
        } catch (error) {
          console.error(`[POST /shopping/air] Failed to parse ${result.airlineCode} response:`, {
            message: error.message,
            stack: error.stack?.split('\n').slice(0, 3).join('\n'),
          });
        }
      } else {
        console.error(`[POST /shopping/air] ${result.airlineCode} failed:`, {
          error: result.error,
          airlineCode: result.airlineCode,
        });
      }
    }

    // Convert all prices to USD
    const normalizedOffers = convertOffersToUSD(allOffers);

    if (normalizedOffers.length === 0) {
      const tripType = searchParams.returnDate ? 'ROUND_TRIP' : 'ONE_WAY';
      const vpRevoked = results.some((r) => r.vpRevoked);
      const message = vpRevoked
        ? 'Your digital identity credentials have been revoked. Please re-verify to continue.'
        : 'No Routes available for this input data';
      return res.status(200).json({
        searchId: null,
        tripType,
        flights: [],
        message,
        metadata: { totalOffers: 0, airlines: [] },
      });
    }

    // ── PoC filters (toggle via POC_MODE / POC_MAX_STOPS / POC_MAX_OFFERS env vars) ──
    const pocEnabled = config.poc.enabled;
    const maxStopsPerDirection = pocEnabled ? (searchParams.maxStopsPerDirection ?? config.poc.maxStopsPerDirection) : (searchParams.maxStopsPerDirection ?? undefined);
    const maxOffers = pocEnabled ? (searchParams.maxOffers ?? config.poc.maxOffers) : (searchParams.maxOffers ?? 0);
    const filteredOffers = filterOffers(normalizedOffers, { maxStopsPerDirection, maxOffers });

    // Log per-airline offer counts after filtering
    const offersPerAirline = {};
    filteredOffers.forEach((o) => {
      offersPerAirline[o.airlineCode] = (offersPerAirline[o.airlineCode] || 0) + 1;
    });
    console.log(`[POST /shopping/air] Filtering: maxStops=${maxStopsPerDirection ?? 'none'}, maxOffers=${maxOffers} → ${filteredOffers.length} offers (from ${allOffers.length})`);
    console.log('[POST /shopping/air] Offers per airline after filter:', offersPerAirline);

    // Store search context
    const searchId = searchContextStore.addSearchContext({
      verificationId: req.session?.id,
      searchParams,
      offers: filteredOffers,
      ndcRefs,
      vpData,
    });

    console.log(`[POST /shopping/air] Created search context ${searchId} with ${filteredOffers.length} offers`);

    const tripType = searchParams.returnDate ? 'ROUND_TRIP' : 'ONE_WAY';

    // Group offers by flight (flightGroupKey)
    const flightGroups = {};
    filteredOffers.forEach((offer) => {
      const key = offer.flightGroupKey || offer.offerId;
      if (!flightGroups[key]) {
        flightGroups[key] = {
          flightGroupKey: key,
          airlineCode: offer.airlineCode,
          segments: offer.segments.map((seg) => ({
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
          })),
          fareOptions: [],
        };
      }
      flightGroups[key].fareOptions.push({
        offerId: offer.offerId,
        price: offer.price,
        fareDetails: offer.fareDetails,
      });
    });

    // Sort fare options by price within each group
    Object.values(flightGroups).forEach((group) => {
      group.fareOptions.sort((a, b) => a.price.total - b.price.total);
    });

    // Pick best flight per airline (1 card per airline for PoC)
    const allFlights = Object.values(flightGroups);
    const bestPerAirline = new Map();
    for (const flight of allFlights) {
      const existing = bestPerAirline.get(flight.airlineCode);
      if (!existing || flight.fareOptions.length > existing.fareOptions.length) {
        bestPerAirline.set(flight.airlineCode, flight);
      }
    }
    const flights = [...bestPerAirline.values()];

    // Log final result summary
    console.log(`[POST /shopping/air] ── Final result: ${flights.length} flight card(s) ──`);
    flights.forEach((f) => {
      const cabins = [...new Set(f.fareOptions.map((fo) => fo.fareDetails?.cabinName || 'Unknown'))];
      console.log(`[POST /shopping/air]   ${f.airlineCode}: ${f.fareOptions.length} fare options → cabins: [${cabins.join(', ')}]`);
    });

    res.status(200).json({
      searchId,
      tripType,
      flights,
      metadata: {
        searchId,
        tripType,
        totalFlights: flights.length,
        totalOffers: filteredOffers.length,
        totalBeforeFilter: allOffers.length,
        filters: { maxStopsPerDirection: maxStopsPerDirection ?? 'none', maxOffers },
        airlines: results.filter((r) => r.success).map((r) => r.airlineCode),
        searchCriteria: {
          origin: searchParams.origin,
          destination: searchParams.destination,
          departureDate: searchParams.departureDate,
          returnDate: searchParams.returnDate || null,
        },
      },
    });
  })
);

/**
 * POST /shopping/offers/:offerId/reprice
 * Reprice a specific offer from search results
 */
ndcRouter.post(
  '/shopping/offers/:offerId/reprice',
  hybridAuthenticator,
  asyncHandler(async (req, res) => {
    const { offerId } = req.params;
    const { searchId } = req.body;

    console.log(`[POST /shopping/offers/:offerId/reprice] Repricing offer ${offerId} from search ${searchId}`);

    if (!searchId) {
      throw new AppError({
        statusCode: 400,
        msg: 'searchId is required in request body',
      });
    }

    // ── Demo mode: return mock success without calling airline ──
    if (config.demoMode) {
      console.log(`[POST /shopping/offers/:offerId/reprice] DEMO MODE — skipping real reprice for ${offerId}`);
      return res.status(200).json(buildDemoRepriceResponse(searchId, offerId));
    }

    const vpData = {
      vpToken: req.vpToken,
      agentProfile: req.agentProfile,
      txId: req.vpTxId || null,
    };

    const repricingResult = await repriceOffer(searchId, offerId, vpData);

    console.log(`[POST /shopping/offers/:offerId/reprice] Repricing completed for offer ${offerId}`);

    // Retrieve original offer from search context for fareDetails and segments
    const searchContext = searchContextStore.getSearchContext(searchId);
    const originalOffer = searchContext?.offers?.find((o) => o.offerId === offerId);

    // Convert prices to USD (same as search flow) and recalculate comparison
    const originalPriceUSD = convertPriceToUSD(repricingResult.originalPrice);
    const repricedPriceUSD = convertPriceToUSD(repricingResult.repricedPrice);
    const priceDiffUSD = repricedPriceUSD && originalPriceUSD
      ? Math.round((repricedPriceUSD.total - originalPriceUSD.total) * 100) / 100
      : repricingResult.priceDifference;
    // Recalculate flags in USD (the raw comparison was cross-currency: QAR vs USD)
    const priceChangedUSD = Math.abs(priceDiffUSD) > 0.01;

    res.status(200).json({
      offerId: repricingResult.offerId,
      airlineCode: repricingResult.airlineCode,
      originalPrice: originalPriceUSD,
      repricedPrice: repricedPriceUSD,
      priceChanged: priceChangedUSD,
      priceDifference: priceDiffUSD,
      priceIncreased: priceDiffUSD > 0.01,
      priceDecreased: priceDiffUSD < -0.01,
      priceBreakdown: repricingResult.priceBreakdown,
      validity: repricingResult.validity,
      fareDetails: originalOffer?.fareDetails || null,
      fareRestrictions: repricingResult.fareRestrictions || null,
      segments: originalOffer?.segments?.map((seg) => ({
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
    });
  })
);

/**
 * POST /orders
 * Create an order from a selected offer
 */
ndcRouter.post(
  '/orders',
  hybridAuthenticator,
  asyncHandler(async (req, res) => {
    const { searchId, offerId, passengers, payment } = req.body;

    console.log(`[POST /orders] Creating order for offer ${offerId} from search ${searchId}`);

    if (!searchId || !offerId) {
      throw new AppError({
        statusCode: 400,
        msg: 'searchId and offerId are required',
      });
    }

    if (!passengers || passengers.length === 0) {
      throw new AppError({
        statusCode: 400,
        msg: 'At least one passenger is required',
      });
    }

    // ── Demo mode: return mock order without calling airline ──
    if (config.demoMode) {
      console.log(`[POST /orders] DEMO MODE — skipping real order creation for ${offerId}`);
      return res.status(201).json(buildDemoOrderResponse({
        searchId, offerId, passengers,
        verificationId: req.session?.id,
        agentDid: req.agentProfile?.did,
        agencyId: req.agentProfile?.agency?.id,
      }));
    }

    const vpData = {
      vpToken: req.vpToken,
      agentProfile: req.agentProfile,
      txId: req.vpTxId || null,
    };

    const order = await createOrder(searchId, offerId, { passengers, payment }, vpData);

    console.log(`[POST /orders] Order created successfully: ${order.orderId}`);

    // Convert order total to USD (same as search/reprice flow)
    const totalPriceUSD = order.totalPrice
      ? convertPriceToUSD(order.totalPrice)
      : order.totalPrice;

    res.status(201).json({
      orderId: order.orderId,
      ndcOrderId: order.ndcOrderId,
      bookingReference: order.bookingReference,
      airlineCode: order.airlineCode,
      status: order.status,
      totalPrice: totalPriceUSD,
      passengers: order.passengers,
      segments: order.segments,
      tickets: order.tickets,
    });
  })
);

/**
 * GET /orders/:orderId
 * Get order details by ID (with ownership validation)
 */
ndcRouter.get(
  '/orders/:orderId',
  hybridAuthenticator,
  asyncHandler(async (req, res) => {
    const { orderId } = req.params;

    console.log(`[GET /orders/:orderId] Retrieving order ${orderId}`);

    const order = getOrder(orderId, req.agentProfile);

    const totalPriceUSD = order.totalPrice
      ? convertPriceToUSD(order.totalPrice)
      : order.totalPrice;

    res.status(200).json({
      orderId: order.orderId,
      ndcOrderId: order.ndcOrderId,
      bookingReference: order.bookingReference,
      airlineCode: order.airlineCode,
      status: order.status,
      totalPrice: totalPriceUSD,
      passengers: order.passengers,
      segments: order.segments,
      tickets: order.tickets,
      createdAt: order.createdAt,
    });
  })
);

/**
 * GET /orders
 * Get all orders for current session/agent
 */
ndcRouter.get(
  '/orders',
  verificationIdAuthenticator,
  asyncHandler(async (req, res) => {
    const session = req.session;

    console.log(`[GET /orders] Retrieving orders for session ${session.id}`);

    const orders = getOrdersBySession(session.id);

    res.status(200).json({
      orders: orders.map((order) => ({
        orderId: order.orderId,
        ndcOrderId: order.ndcOrderId,
        bookingReference: order.bookingReference,
        airlineCode: order.airlineCode,
        status: order.status,
        totalPrice: order.totalPrice,
        segments: order.segments,
        createdAt: order.createdAt,
      })),
    });
  })
);

/**
 * GET /me
 * Get current agent profile
 */
ndcRouter.get(
  '/me',
  verificationIdAuthenticator,
  asyncHandler(async (req, res) => {
    const session = req.session;
    const agentProfile = session.agentProfile;

    if (!agentProfile) {
      throw new AppError({
        statusCode: 404,
        msg: 'Agent profile not found in session',
      });
    }

    console.log(`[GET /me] Returning profile for agent: ${agentProfile.did}`);

    res.status(200).json({
      id: session.id,
      did: agentProfile.did,
      name: agentProfile.name,
      email: agentProfile.email,
      agency: {
        id: agentProfile.agency?.id,
        name: agentProfile.agency?.name,
        iataNumber: agentProfile.agency?.iataNumber,
      },
      roles: agentProfile.roles,
    });
  })
);

export default ndcRouter;
