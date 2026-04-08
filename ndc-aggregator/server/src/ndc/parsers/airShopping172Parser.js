import { XMLParser } from 'fast-xml-parser';
import { AppError } from '../../appError.js';

/**
 * Parse AirShoppingRS XML for NDC 17.2 airlines
 *
 * NDC 17.2 structure:
 *   Offers:     OffersGroup > AirlineOffers > Offer[]
 *   Flights:    DataLists > FlightList > Flight[] (FlightKey → SegmentReferences)
 *   Segments:   DataLists > FlightSegmentList > FlightSegment[] (SegmentKey → Departure/Arrival/Carrier)
 *   ODs:        DataLists > OriginDestinationList > OriginDestination[] (FlightReferences)
 *   PriceClass: DataLists > PriceClassList > PriceClass[]
 *   Baggage:    DataLists > BaggageAllowanceList > BaggageAllowance[]
 *   Passengers: DataLists > PassengerList > Passenger[]
 *
 * @param {string} xmlResponse - Raw XML (SOAP-unwrapped)
 * @param {string} airlineCode - IATA airline code
 * @returns {object} Same normalized shape as 21.x parser
 */
export const parseAirShopping172RS = (xmlResponse, airlineCode) => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    removeNSPrefix: true,
  });

  let parsed;
  try {
    parsed = parser.parse(xmlResponse);
  } catch (error) {
    console.error(`[AirShopping172Parser] XML parsing error for ${airlineCode}:`, error);
    throw new AppError({
      statusCode: 502,
      msg: `Failed to parse ${airlineCode} response: ${error.message}`,
    });
  }

  let rs = parsed.AirShoppingRS || parsed;
  // If the XML contains multiple AirShoppingRS elements, take the first
  if (Array.isArray(rs)) {
    console.log(`[AirShopping172Parser] Found ${rs.length} AirShoppingRS elements, using first`);
    rs = rs[0];
  }

  // Check for errors
  if (rs.Errors) {
    const errArr = toArray(rs.Errors.Error);

    // VP revoked — credentials are revoked by the issuer, return empty result silently
    if (errArr.some((e) => e.StatusText === 'DIGITAL_ID_VP_IS_REVOKED_ERROR' || e['@_StatusText'] === 'DIGITAL_ID_VP_IS_REVOKED_ERROR')) {
      console.warn(`[AirShopping172Parser] ${airlineCode}: VP credentials are revoked (DIGITAL_ID_VP_IS_REVOKED_ERROR). Returning empty result.`);
      return { airlineCode, shoppingResponseId: null, offers: [], metadata: { timestamp: new Date().toISOString(), correlationId: null } };
    }

    const msg = errArr.map((e) => e['@_ShortText'] || e.ShortText || JSON.stringify(e)).join('; ');
    console.error(`[AirShopping172Parser] ${airlineCode} returned error:`, msg);
    throw new AppError({ statusCode: 502, msg: `${airlineCode} error: ${msg}` });
  }

  const shoppingResponseId = rs.ShoppingResponseID?.ResponseID || null;
  const offers = extractOffers172(rs, airlineCode);

  return {
    airlineCode,
    shoppingResponseId,
    offers,
    metadata: {
      timestamp: rs['@_TimeStamp'] || new Date().toISOString(),
      correlationId: rs['@_TransactionIdentifier'] || null,
    },
  };
};

// ── Helpers ──

const toArray = (val) => {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
};

const buildMap = (arr, keyFn) => {
  const map = {};
  toArray(arr).forEach((item) => {
    const key = keyFn(item);
    if (key) map[key] = item;
  });
  return map;
};

// ── Main extraction ──

const extractOffers172 = (rs, airlineCode) => {
  const dataLists = rs.DataLists || {};

  // ── Build lookup maps ──
  const segmentMap = buildMap(
    dataLists.FlightSegmentList?.FlightSegment,
    (s) => s['@_SegmentKey']
  );
  const flightMap = buildMap(
    dataLists.FlightList?.Flight,
    (f) => f['@_FlightKey']
  );
  const priceClassMap = buildMap(
    dataLists.PriceClassList?.PriceClass,
    (pc) => pc['@_PriceClassID']
  );
  const baggageMap = buildMap(
    dataLists.BaggageAllowanceList?.BaggageAllowance,
    (ba) => ba['@_BaggageAllowanceID']
  );

  // ── OD list: map FlightKey → OD index for journeyDirection ──
  const originDests = toArray(dataLists.OriginDestinationList?.OriginDestination);
  const flightKeyToOdIndex = {};
  originDests.forEach((od, idx) => {
    const refs = (od.FlightReferences || '').toString().split(/\s+/).filter(Boolean);
    refs.forEach((fk) => {
      flightKeyToOdIndex[fk] = idx;
    });
  });

  // ── Passengers ──
  const paxList = toArray(dataLists.PassengerList?.Passenger);
  const paxIds = paxList.map((p) => p['@_PassengerID']).filter(Boolean);
  const passengers = paxList.map((p) => ({
    paxId: p['@_PassengerID'],
    type: p.PTC || 'ADT',
  }));

  const maps = { segmentMap, flightMap, priceClassMap, baggageMap, flightKeyToOdIndex, paxIds, passengers };

  // ── Offers ──
  const offersData = rs.OffersGroup?.AirlineOffers?.Offer;
  const offersArray = toArray(offersData);

  if (offersArray.length === 0) {
    console.log(`[AirShopping172Parser] No offers found in ${airlineCode} response`);
    return [];
  }

  console.log(`[AirShopping172Parser] Parsing ${offersArray.length} offers from ${airlineCode}`);
  return offersArray.map((offer) => parseOffer172(offer, airlineCode, maps));
};

// ── Parse single Offer ──

const parseOffer172 = (offer, airlineCode, maps) => {
  const offerId = offer['@_OfferID'];
  const ownerCode = offer['@_Owner'] || airlineCode;
  const expiresAt =
    offer.TimeLimits?.OtherLimits?.OtherLimit?.TicketByTimeLimit?.TicketBy ||
    offer.OfferExpirationDateTime ||
    null;

  // ── Resolve flight(s) and segments ──
  // Variant A uses FlightsOverview > FlightRef; Variant B uses OfferItem > Service > FlightRefs
  let flightRefs = toArray(offer.FlightsOverview?.FlightRef);
  if (flightRefs.length === 0) {
    // Variant B fallback: extract FlightRefs from OfferItem > Service
    const serviceFlightRefs = new Set();
    toArray(offer.OfferItem).forEach((item) => {
      toArray(item.Service).forEach((svc) => {
        const refs = (svc.FlightRefs || '').toString().split(/\s+/).filter(Boolean);
        refs.forEach((r) => serviceFlightRefs.add(r));
      });
    });
    flightRefs = [...serviceFlightRefs];
  }
  const segments = [];

  flightRefs.forEach((fRef) => {
    // FlightRef can be { '#text': flightKey, '@_ODRef': 'OD1' } or just a string
    const flightKey = typeof fRef === 'string' ? fRef : fRef['#text'];
    const odRef = typeof fRef === 'object' ? fRef['@_ODRef'] : null;

    const flight = maps.flightMap[flightKey];
    if (!flight) return;

    const odIndex = maps.flightKeyToOdIndex[flightKey] || 0;
    const journeyDirection = odIndex >= 1 ? 'inbound' : 'outbound';
    const journeyDuration = flight.Journey?.Time || null;

    // Flight.SegmentReferences is space-separated SegmentKeys
    const segKeys = (flight.SegmentReferences || '').toString().split(/\s+/).filter(Boolean);
    segKeys.forEach((segKey) => {
      const seg = maps.segmentMap[segKey];
      if (!seg) return;

      const mktCarrier = seg.MarketingCarrier || {};
      const opCarrier = seg.OperatingCarrier || {};
      const dep = seg.Departure || {};
      const arr = seg.Arrival || {};

      segments.push({
        paxSegmentId: segKey,                                                              // → INTERNAL: used in ndcReferences.paxSegmentIds for repricing/booking
        flightNumber: `${mktCarrier.AirlineID || ownerCode}${mktCarrier.FlightNumber || ''}`, // → FE: displayed on flight card (e.g. "AC845")
        departureAirport: dep.AirportCode || '',                                            // → FE: displayed as origin IATA code
        departureTime: combineDateAndTime(dep.Date, dep.Time),                              // → FE: displayed as departure time on flight card
        departureStation: '', // not provided in 17.2                                       // → FE: airport name (empty for 17.2, populated for 21.x)
        arrivalAirport: arr.AirportCode || '',                                              // → FE: displayed as destination IATA code
        arrivalTime: combineDateAndTime(arr.Date, arr.Time),                                // → FE: displayed as arrival time on flight card
        arrivalStation: '',                                                                 // → FE: airport name (empty for 17.2)
        departureTerminal: dep.Terminal?.Name || '',                                         // → FE: shown if available
        arrivalTerminal: arr.Terminal?.Name || '',                                           // → FE: shown if available
        duration: seg.FlightDetail?.FlightDuration?.Value || journeyDuration || null,        // → FE: displayed as flight duration (e.g. "PT08H15M")
        carrierCode: mktCarrier.AirlineID || ownerCode,                                     // → FE: airline logo / display
        operatingCarrier: opCarrier.AirlineID || mktCarrier.AirlineID || ownerCode,          // → FE: "operated by" label when differs from marketing carrier
        aircraft: seg.Equipment?.AircraftCode || '',                                         // → FE: aircraft type code
        aircraftName: '', // not provided                                                   // → FE: aircraft type name (empty for 17.2)
        cabinCode: seg.ClassOfService?.MarketingName?.['@_CabinDesignator'] || '',           // → INTERNAL: fallback cabin code for fareDetails.cabinClass
        cabinName: seg.ClassOfService?.MarketingName?.['#text'] || seg.ClassOfService?.MarketingName || '', // → INTERNAL: fallback cabin name for fareDetails.cabinName
        seatsLeft: seg.ClassOfService?.Code?.['@_SeatsLeft'] || null,                        // → FE (future): seats remaining indicator
        stops: parseInt(seg.FlightDetail?.Stops?.StopQuantity || '0', 10),                   // → INTERNAL: used by filterOffers() for maxStopsPerDirection
        journeyDirection,                                                                    // → FE: determines outbound vs inbound grouping
      });
    });
  });

  // ── Pricing ──
  // Variant A uses DetailCurrencyPrice > Total[@Code]; Variant B uses SimpleCurrencyPrice[@Code]
  const totalPriceNode = offer.TotalPrice?.DetailCurrencyPrice;
  const simplePriceNode = offer.TotalPrice?.SimpleCurrencyPrice;
  const offerItems = toArray(offer.OfferItem);
  const firstItem = offerItems[0];

  // Variant B pricing: FareDetail > Price > BaseAmount[@Code] and Taxes > Total[@Code]
  // Variant A pricing: OfferItem > TotalPriceDetail > BaseAmount, Taxes > Total
  const itemPrice = firstItem?.TotalPriceDetail || {};
  const fareDetailPrice = toArray(firstItem?.FareDetail)?.[0]?.Price || {};

  let price;
  if (totalPriceNode) {
    // Variant A path: DetailCurrencyPrice
    price = {
      total: parseFloat(totalPriceNode.Total?.['#text'] || totalPriceNode.Total || 0),
      currency: totalPriceNode.Total?.['@_Code'] || 'USD',
      base: parseFloat(itemPrice.BaseAmount?.['#text'] || itemPrice.BaseAmount || 0),
      taxes: parseFloat(itemPrice.Taxes?.Total?.['#text'] || itemPrice.Taxes?.Total || 0),
    };
  } else if (simplePriceNode) {
    // Variant B path: SimpleCurrencyPrice
    price = {
      total: parseFloat(simplePriceNode['#text'] || simplePriceNode || 0),
      currency: simplePriceNode['@_Code'] || 'USD',
      base: parseFloat(fareDetailPrice.BaseAmount?.['#text'] || fareDetailPrice.BaseAmount || 0),
      taxes: parseFloat(fareDetailPrice.Taxes?.Total?.['#text'] || fareDetailPrice.Taxes?.Total || 0),
    };
  } else {
    price = { total: 0, currency: 'USD', base: 0, taxes: 0 };
  }

  // ── Fare details (from first OfferItem.FareDetail.FareComponent) ──
  const fareComponents = [];
  offerItems.forEach((item) => {
    toArray(item.FareDetail).forEach((fd) => {
      toArray(fd.FareComponent).forEach((fc) => fareComponents.push(fc));
    });
  });
  const fc = fareComponents[0] || {};
  const fareBasis = fc.FareBasis || {};
  const cabinType = fareBasis.CabinType || {};
  const priceClassRef = fc.PriceClassRef || null;
  const priceClass = priceClassRef ? maps.priceClassMap[priceClassRef] : null;

  // ── Baggage (from Offer.BaggageAllowance[]) ──
  const baggage = resolveAcBaggage(toArray(offer.BaggageAllowance), maps.baggageMap);

  // ── Restrictions ──
  // PriceClass descriptions are the reliable source for flexibility;
  // Penalty attributes are ambiguous (e.g. Basic and Standard both have ChangeFeeInd="true")
  const flexibility = extractAcRestrictions(fareComponents, priceClass);

  // ── Included services ──
  // NDC 17.2 communicates fare features via PriceClass descriptions
  const includedServices = priceClass
    ? toArray(priceClass.Descriptions?.Description).map((d, i) => ({
        id: `${priceClassRef}-svc-${i}`,
        name: d.Text || d || '',
        description: '',
        rfisc: '',
      }))
    : [];

  // ── Cabin info ──
  // Variant A: FareBasis > CabinType; Variant B: PriceClass > ClassOfService > MarketingName
  const pcClassOfService = priceClass?.ClassOfService || {};
  const pcMarketingName = pcClassOfService.MarketingName || {};
  const cabinDesignator = cabinType.CabinTypeCode || pcMarketingName['@_CabinDesignator'] || segments[0]?.cabinCode || '';
  const cabinLabel = cabinType.CabinTypeName || (typeof pcMarketingName === 'string' ? pcMarketingName : pcMarketingName['#text']) || segments[0]?.cabinName || 'Economy';

  const fareDetails = {
    cabinClass: cabinDesignator,                                                             // → FE: cabin tier indicator (e.g. "5"=economy, "2"=business)
    cabinName: cabinLabel,                                                                   // → FE: cabin label shown on fare card (e.g. "Economy", "Business")
    priceClassName: priceClass?.Name || '',                                                  // → FE: fare brand name on fare card (e.g. "Basic", "Standard", "Flex")
    bookingClass: fareBasis.RBD || fareBasis.FareBasisCode?.Code || pcClassOfService.Code?.['#text'] || '',  // → FE (future): booking class letter
    fareBasis: fareBasis.FareBasisCode?.Code || '',                                          // → FE (future): fare basis code
    baggage,                                                                                 // → FE: baggage allowance icons/labels (see sub-fields below)
    flexibility,                                                                             // → FE: refundable/changeable badges (see sub-fields below)
    includedServices,                                                                        // → FE: list of included fare features (e.g. "Free changes", "No refund")
  };

  const flightGroupKey = segments.map((s) => `${s.flightNumber}-${s.departureTime}`).join('|');

  // All ndcReferences are INTERNAL — stored in searchContextStore, used by repricing/booking services
  const ndcReferences = {
    offerId,                                                                                  // offer ID for OfferPriceRQ
    ownerCode,                                                                                // airline owner for routing
    offerItemIds: offerItems.map((item) => item['@_OfferItemID']),                            // offer item IDs for OfferPriceRQ
    paxIds: maps.paxIds,                                                                      // passenger refs for OfferPriceRQ
    paxSegmentIds: segments.map((s) => s.paxSegmentId),                                       // segment refs
    priceClassId: priceClassRef,                                                               // price class ref
    flightRefs: flightRefs.map((fRef) => (typeof fRef === 'string' ? fRef : fRef['#text'])),  // variant A flight refs
    serviceRefs: offerItems.flatMap((item) =>                                                  // variant A service refs
      toArray(item.Service).map((s) => s['@_ServiceID']).filter(Boolean)
    ),
  };

  return {
    offerId,                         // → FE: unique offer identifier (passed back on reprice/book)
    airlineCode: ownerCode,          // → FE: airline code for logo + grouping
    passengers: maps.passengers,     // → INTERNAL: pax list for repricing/booking flow (not sent to FE)
    price,                           // → FE: price object (total, currency, base, taxes)
    segments,                        // → FE: flight segments with times, airports, carriers
    fareDetails,                     // → FE: fare card content (cabin, brand, baggage, flexibility, services)
    flightGroupKey,                  // → INTERNAL: groups offers sharing identical flights into one flight card
    expiresAt,                       // → INTERNAL: offer validity deadline (not sent to FE currently)
    ndcReferences,                   // → INTERNAL: stored in searchContextStore for repricing/booking (not sent to FE)
  };
};

// ── NDC 17.2-specific helpers ──

/**
 * Combine separate date and time strings into ISO-like datetime
 * e.g. '2026-02-09' + '09:45' → '2026-02-09T09:45'
 */
const combineDateAndTime = (date, time) => {
  if (!date) return '';
  if (!time) return date;
  return `${date}T${time}`;
};

/**
 * Resolve baggage from NDC 17.2 Offer.BaggageAllowance[]
 * Each entry: { FlightRefs, PassengerRefs, BaggageAllowanceRef }
 * BaggageAllowanceRef → BaggageAllowanceList entry with BaggageCategory
 */
const resolveAcBaggage = (offerBaggageRefs, baggageMap) => {
  const result = { personalItem: false, checkedBags: 0, checkedBagWeight: null, cabinBag: false };
  const seen = new Set();

  offerBaggageRefs.forEach((ref) => {
    const baId = ref.BaggageAllowanceRef;
    if (!baId || seen.has(baId)) return;
    seen.add(baId);

    const ba = baggageMap[baId];
    if (!ba) return;

    const category = (ba.BaggageCategory || '').toLowerCase();
    const descText = ba.AllowanceDescription?.Descriptions?.Description?.Text || '';

    if (category === 'checked') {
      const qty = parseInt(ba.PieceAllowance?.TotalQuantity || 0, 10);
      if (qty > result.checkedBags) result.checkedBags = qty;

      // Extract weight from PieceMeasurements
      const measurements = toArray(ba.PieceAllowance?.PieceMeasurements);
      measurements.forEach((m) => {
        const weightAllowances = toArray(m.PieceWeightAllowance);
        weightAllowances.forEach((wa) => {
          // Some variants may have multiple MaximumWeight entries (kg + lb) under one PieceWeightAllowance
          const maxWeights = toArray(wa.MaximumWeight);
          maxWeights.forEach((mw) => {
            const val = mw.Value || mw?.['#text'];
            const uom = mw.UOM || mw?.['@_UOM'];
            if (val && uom === 'K') {
              result.checkedBagWeight = `${val} kg`;
            }
          });
        });
      });
    } else if (category === 'carryon') {
      if (descText.toLowerCase().includes('standard article') || descText.toLowerCase().includes('carry')) {
        result.cabinBag = true;
      } else if (descText.toLowerCase().includes('personal')) {
        result.personalItem = true;
      } else {
        // Default: treat carryOn as cabin bag
        result.cabinBag = true;
      }
    }

    // Handle personal item by ID pattern or description
    if (baId.toUpperCase().includes('PERSONAL')) {
      result.personalItem = true;
    }
    if (baId.toUpperCase().includes('STANDARD_ARTICLE')) {
      result.cabinBag = true;
    }
  });

  return result;
};

/**
 * Extract restrictions from NDC 17.2 using PriceClass descriptions (primary)
 * and Penalty detail entries (for fee amounts).
 *
 * Some airline Penalty attributes are ambiguous:
 *   Basic:    ChangeFeeInd="true"  → actually means "No changes"
 *   Standard: ChangeFeeInd="true"  → means "Changes for a fee"
 *   Comfort:  ChangeFeeInd="false" → means "Free changes"
 *
 * PriceClass descriptions are reliable:
 *   "No changes"          → not changeable
 *   "Changes for a fee"   → changeable (fee)
 *   "Free changes"        → changeable (free)
 *   "No refund"           → not refundable
 *   "Refundable for a fee"→ refundable (fee)
 *   "Fully refundable"    → refundable (free)
 */
const extractAcRestrictions = (fareComponents, priceClass) => {
  const result = {
    refundable: false,
    changeable: false,
    changeForFee: false,
    cancelForFee: false,
    cancelRestrictions: [],
    changeRestrictions: [],
  };

  // ── Primary: derive from PriceClass descriptions ──
  if (priceClass) {
    const descriptions = toArray(priceClass.Descriptions?.Description)
      .map((d) => (d.Text || d || '').toLowerCase());

    for (const desc of descriptions) {
      // Variant A format: "Free changes", "Changes for a fee", "No changes"
      if (desc.includes('free changes'))        { result.changeable = true; }
      else if (desc.includes('changes for a fee')) { result.changeable = true; result.changeForFee = true; }
      else if (desc.includes('no changes'))     { result.changeable = false; }

      if (desc.includes('fully refundable'))    { result.refundable = true; }
      else if (desc.includes('refundable for a fee')) { result.refundable = true; result.cancelForFee = true; }
      else if (desc.includes('no refund'))      { result.refundable = false; }

      // Variant B format: "CHA - CHANGE BEFORE DEPARTURE", "INC - CHANGE BEFORE DEPARTURE", "NOF - REFUND BEFORE DEPARTURE"
      if (desc.match(/^inc\s*-\s*change/))       { result.changeable = true; }
      else if (desc.match(/^cha\s*-\s*change/))  { result.changeable = true; result.changeForFee = true; }

      if (desc.match(/^inc\s*-\s*refund/))       { result.refundable = true; }
      else if (desc.match(/^cha\s*-\s*refund/))  { result.refundable = true; result.cancelForFee = true; }
      else if (desc.match(/^nof\s*-\s*refund/))  { result.refundable = false; }
    }
  }

  // ── Secondary: extract fee amounts from Penalty details ──
  fareComponents.forEach((fc) => {
    toArray(fc.FareRules?.Penalty).forEach((penalty) => {
      // If we had no PriceClass, fall back to attributes
      if (!priceClass) {
        if (penalty['@_RefundableInd'] === 'true') result.refundable = true;
        if (penalty['@_ChangeFeeInd'] === 'true') result.changeable = true;
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
            description: result.changeForFee ? 'For a fee' : 'Free',
            fee,
            currency,
            stage: detail.Application || '',
          });
        } else if (type === 'cancel') {
          result.cancelRestrictions.push({
            allowed: result.refundable,
            description: result.cancelForFee ? 'For a fee' : (result.refundable ? 'Free' : 'Not allowed'),
            fee,
            currency,
            stage: detail.Application || '',
          });
        }
      });
    });
  });

  return result;
};
