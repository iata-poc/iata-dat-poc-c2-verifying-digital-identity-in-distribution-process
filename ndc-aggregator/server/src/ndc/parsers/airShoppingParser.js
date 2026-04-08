import { XMLParser } from 'fast-xml-parser';
import { AppError } from '../../appError.js';
import { parseAirShopping172RS } from './airShopping172Parser.js';

/**
 * Parse IATA_AirShoppingRS XML response (NDC 21.x format)
 *
 * NDC 21.x structure: Response > OffersGroup > CarrierOffers > Offer[]
 * Segment chain: PaxJourney → PaxSegment → DatedMarketingSegment
 * Baggage:       Offer.BaggageAssociations → BaggageAllowanceList
 * Restrictions:  FareComponent > CancelRestrictions / ChangeRestrictions
 * Services:      OfferItem.Service → ServiceDefinitionList
 *
 * @param {string} xmlResponse - XML response from airline
 * @param {string} airlineCode - IATA airline code
 * @returns {object} Normalized offers array
 */
/**
 * Filter offers to only direct flights (1 segment per journey direction)
 * and optionally limit the number of results (sorted cheapest first).
 *
 * @param {Array} offers - Parsed offers from parseAirShoppingRS
 * @param {object} [options] - Filter options
 * @param {number}  [options.maxStopsPerDirection] - Max stops per direction (0=direct, 1=one connection, null=no filter)
 * @param {number}  [options.maxOffers]            - Max offers to return (cheapest first)
 * @returns {Array} Filtered/limited offers
 */
export const filterOffers = (offers, options = {}) => {
  let filtered = [...offers];

  if (options.maxStopsPerDirection != null) {
    const maxSegs = options.maxStopsPerDirection + 1; // 0 stops = 1 segment, 1 stop = 2 segments
    filtered = filtered.filter((offer) => {
      const directionCounts = {};
      for (const seg of offer.segments) {
        const dir = seg.journeyDirection || 'outbound';
        directionCounts[dir] = (directionCounts[dir] || 0) + 1;
      }
      return Object.values(directionCounts).every((count) => count <= maxSegs);
    });
  }

  // Sort by price ascending (cheapest first)
  filtered.sort((a, b) => (a.price?.total || 0) - (b.price?.total || 0));

  if (options.maxOffers && options.maxOffers > 0) {
    filtered = filtered.slice(0, options.maxOffers);
  }

  return filtered;
};

export const parseAirShoppingRS = (xmlResponse, airlineCode) => {
  // Detect NDC 17.2 format vs IATA 21.x format
  // NDC 17.2 uses <AirShoppingRS>, IATA 21.36/21.3 uses <IATA_AirShoppingRS>
  const is172 = xmlResponse.includes('<AirShoppingRS') && !xmlResponse.includes('<IATA_AirShoppingRS');

  if (is172) {
    console.log(`[AirShoppingParser] Detected NDC 17.2 format for ${airlineCode}, delegating to 17.2 parser`);
    return parseAirShopping172RS(xmlResponse, airlineCode);
  }

  console.log(`[AirShoppingParser] Detected IATA 21.36 format for ${airlineCode} (${xmlResponse.length} bytes)`);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false, // keep values as strings to avoid number truncation
    removeNSPrefix: true,
  });

  let parsedData;
  try {
    parsedData = parser.parse(xmlResponse);
  } catch (error) {
    console.error(`[AirShoppingParser] ${airlineCode} XML parsing error:`, {
      message: error.message,
      xmlSnippet: xmlResponse.substring(0, 300),
    });
    throw new AppError({
      statusCode: 502,
      msg: `Failed to parse ${airlineCode} response: ${error.message}`,
    });
  }

  const response = parsedData.IATA_AirShoppingRS || parsedData;

  // Check for errors
  if (response.Error || response.Errors) {
    const allErrors = extractAllErrors(response);
    const errorMsg = extractErrorMessage(response);

    // VP revoked — credentials are revoked by the issuer, return empty result silently
    if (isVpRevokedError(response)) {
      console.warn(`[AirShoppingParser] ${airlineCode}: VP credentials are revoked (DIGITAL_ID_VP_IS_REVOKED_ERROR). Returning empty result.`);
      return { airlineCode, shoppingResponseId: null, offers: [], metadata: { timestamp: new Date().toISOString(), correlationId: null } };
    }

    console.error(`[AirShoppingParser] ${airlineCode} returned NDC error:`, {
      message: errorMsg,
      errorCount: allErrors.length,
      errors: allErrors,
      correlationId: response.PayloadAttributes?.CorrelationID || 'N/A',
      xmlSnippet: xmlResponse.substring(0, 500),
    });
    throw new AppError({
      statusCode: 502,
      msg: `${airlineCode} returned error: ${errorMsg}`,
    });
  }

  // Extract offers using the NDC 21.x structure
  const offers = extractOffers(response, airlineCode);

  return {
    airlineCode,
    shoppingResponseId: response.Response?.ShoppingResponseID?.ResponseID || null,
    offers,
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

/**
 * Extract all error entries for logging
 */
const extractAllErrors = (response) => {
  const errors = response.Error || response.Errors?.Error || [];
  const errorArray = Array.isArray(errors) ? errors : [errors];
  return errorArray.map((e) => ({
    code: e['@_Code'] || e.Code || e.ErrorCode || 'N/A',
    type: e['@_Type'] || e.Type || 'N/A',
    message: e.DescText || e.ErrorText || e.StatusText || JSON.stringify(e),
    owner: e['@_Owner'] || e.Owner || 'N/A',
  }));
};

/**
 * Check if the NDC error is a VP revoked error (credentials revoked by issuer)
 */
const isVpRevokedError = (response) => {
  const errors = response.Error || response.Errors?.Error || [];
  const errorArray = Array.isArray(errors) ? errors : [errors];
  return errorArray.some((e) => e.StatusText === 'DIGITAL_ID_VP_IS_REVOKED_ERROR');
};

// ── Helper: safely wrap to array ──
const toArray = (val) => {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
};

// ── Build lookup maps from DataLists ──

const buildMap = (arr, keyFn) => {
  const map = {};
  toArray(arr).forEach((item) => {
    const key = keyFn(item);
    if (key) map[key] = item;
  });
  return map;
};

/**
 * Extract and normalize offers from NDC 21.x response
 *
 * NDC 21.x puts offers under: Response > OffersGroup > CarrierOffers > Offer[]
 * NOT under DataLists > OfferList
 */
const extractOffers = (response, airlineCode) => {
  const dataLists = response.Response?.DataLists || {};

  // ── Segment chain maps ──
  // PaxSegment → DatedMarketingSegment → DatedOperatingSegment (for duration)
  const datedMktSegMap = buildMap(
    dataLists.DatedMarketingSegmentList?.DatedMarketingSegment,
    (s) => s.DatedMarketingSegmentId
  );
  const datedOpSegMap = buildMap(
    dataLists.DatedOperatingSegmentList?.DatedOperatingSegment,
    (s) => s.DatedOperatingSegmentId
  );
  const datedOpLegMap = buildMap(
    dataLists.DatedOperatingLegList?.DatedOperatingLeg,
    (l) => l.DatedOperatingLegID
  );
  const paxSegmentMap = buildMap(
    dataLists.PaxSegmentList?.PaxSegment,
    (s) => s.PaxSegmentID
  );
  const paxJourneyMap = buildMap(
    dataLists.PaxJourneyList?.PaxJourney,
    (j) => j.PaxJourneyID
  );
  const originDestMap = buildMap(
    dataLists.OriginDestList?.OriginDest,
    (od) => od.OriginDestID
  );

  // ── Reference data maps ──
  const priceClassMap = buildMap(
    dataLists.PriceClassList?.PriceClass,
    (pc) => pc.PriceClassID
  );
  const baggageMap = buildMap(
    dataLists.BaggageAllowanceList?.BaggageAllowance,
    (ba) => ba.BaggageAllowanceID
  );
  const serviceDefMap = buildMap(
    dataLists.ServiceDefinitionList?.ServiceDefinition,
    (sd) => sd.ServiceDefinitionID
  );
  const penaltyMap = buildMap(
    dataLists.PenaltyList?.Penalty,
    (p) => p.PenaltyID
  );

  // Build OriginDest lookup: which PaxJourneyIDs belong to which OD index
  const journeyToOdIndex = {};
  const originDests = toArray(dataLists.OriginDestList?.OriginDest);
  originDests.forEach((od, idx) => {
    toArray(od.PaxJourneyRefID).forEach((jid) => {
      journeyToOdIndex[jid] = idx;
    });
  });

  // Extract passenger info from DataLists.PaxList (needed for OfferPrice/OrderCreate + display)
  const paxList = toArray(dataLists.PaxList?.Pax);
  const paxIds = paxList.map((p) => p.PaxID).filter(Boolean);
  const passengers = paxList.map((p) => ({ paxId: p.PaxID, type: p.PTC || 'ADT' }));

  const maps = {
    datedMktSegMap, datedOpSegMap, datedOpLegMap,
    paxSegmentMap, paxJourneyMap, originDestMap,
    priceClassMap, baggageMap, serviceDefMap, penaltyMap,
    journeyToOdIndex, paxIds, passengers,
  };

  // NDC 21.x: Offers at Response > OffersGroup > CarrierOffers > Offer[]
  const carrierOffers = response.Response?.OffersGroup?.CarrierOffers;
  const offersData = carrierOffers?.Offer || [];
  const offersArray = toArray(offersData);

  if (offersArray.length === 0) {
    console.log(`[AirShoppingParser] No offers found in ${airlineCode} response`);
    return [];
  }

  return offersArray.map((offer) => parseOffer(offer, airlineCode, maps));
};

/**
 * Parse a single NDC 21.x Offer element
 */
const parseOffer = (offer, airlineCode, maps) => {
  const offerId = offer.OfferID;
  const ownerCode = offer.OwnerCode || airlineCode;
  const expiresAt = offer.OfferExpirationTimeLimitDateTime || null;

  // ── Resolve PriceClass via JourneyOverview ──
  const journeyPriceClasses = toArray(offer.JourneyOverview?.JourneyPriceClass);
  const firstJpc = journeyPriceClasses[0];
  const priceClassRef = firstJpc?.PriceClassRefID || offer.JourneyOverview?.PriceClassRefID;
  const priceClass = priceClassRef ? maps.priceClassMap[priceClassRef] : null;

  // ── Resolve segments via JourneyOverview → PaxJourney → PaxSegment → DatedMarketingSegment ──
  const segments = [];
  journeyPriceClasses.forEach((jpc) => {
    const journey = maps.paxJourneyMap[jpc.PaxJourneyRefID];
    if (!journey) return;
    const odIndex = maps.journeyToOdIndex[jpc.PaxJourneyRefID];
    const journeyDirection = odIndex >= 1 ? 'inbound' : 'outbound';

    toArray(journey.PaxSegmentRefID).forEach((psRefId) => {
      const paxSeg = maps.paxSegmentMap[psRefId];
      if (!paxSeg) return;
      const mktSeg = maps.datedMktSegMap[paxSeg.DatedMarketingSegmentRefId];
      if (!mktSeg) return;

      // Resolve operating segment for duration and aircraft
      const opSeg = maps.datedOpSegMap[mktSeg.DatedOperatingSegmentRefId];
      const opLeg = opSeg ? maps.datedOpLegMap[opSeg.DatedOperatingLegRefID] : null;

      segments.push({
        paxSegmentId: psRefId,                                                                        // → INTERNAL: used in ndcReferences.paxSegmentIds for repricing/booking
        flightNumber: `${mktSeg.CarrierDesigCode || airlineCode}${mktSeg.MarketingCarrierFlightNumberText || ''}`, // → FE: displayed on flight card (e.g. "TK1821")
        departureAirport: mktSeg.Dep?.IATA_LocationCode || '',                                         // → FE: displayed as origin IATA code
        departureTime: mktSeg.Dep?.AircraftScheduledDateTime || '',                                    // → FE: displayed as departure time on flight card
        departureStation: mktSeg.Dep?.StationName || '',                                               // → FE: airport name (e.g. "Istanbul Airport")
        arrivalAirport: mktSeg.Arrival?.IATA_LocationCode || '',                                       // → FE: displayed as destination IATA code
        arrivalTime: mktSeg.Arrival?.AircraftScheduledDateTime || '',                                  // → FE: displayed as arrival time on flight card
        arrivalStation: mktSeg.Arrival?.StationName || '',                                             // → FE: airport name (e.g. "Charles De Gaulle")
        departureTerminal: mktSeg.Dep?.TerminalName || '',                                             // → FE: shown if available
        arrivalTerminal: mktSeg.Arrival?.TerminalName || '',                                           // → FE: shown if available
        duration: opSeg?.Duration || journey.Duration || null,                                         // → FE: displayed as flight duration (e.g. "PT4H55M")
        carrierCode: mktSeg.CarrierDesigCode || airlineCode,                                           // → FE: airline logo / display
        operatingCarrier: opSeg?.CarrierDesigCode || mktSeg.CarrierDesigCode || airlineCode,            // → FE: "operated by" label when differs from marketing carrier
        aircraft: opLeg?.CarrierAircraftType?.CarrierAircraftTypeCode || '',                            // → FE: aircraft type code
        aircraftName: opLeg?.CarrierAircraftType?.CarrierAircraftTypeName || '',                        // → FE: aircraft type name (e.g. "Airbus A330-300")
        journeyDirection,                                                                              // → FE: determines outbound vs inbound grouping
      });
    });
  });

  // ── Resolve baggage from Offer.BaggageAssociations ──
  const baggageAssoc = toArray(offer.BaggageAssociations);
  const baggage = resolveTkBaggage(baggageAssoc, maps.baggageMap);

  // ── Extract pricing from OfferItem ──
  const offerItems = toArray(offer.OfferItem);
  const firstItem = offerItems[0];
  const itemPrice = firstItem?.Price || {};
  const price = {
    total: parseFloat(itemPrice.TotalAmount?.['#text'] || itemPrice.TotalAmount || 0),                 // → FE: main price displayed on fare card
    currency: itemPrice.TotalAmount?.['@_CurCode'] || 'USD',                                          // → FE: currency symbol/code beside price
    base: parseFloat(itemPrice.EquivAmount?.['#text'] || itemPrice.EquivAmount || itemPrice.BaseAmount?.['#text'] || itemPrice.BaseAmount || 0),  // → FE: price breakdown (base fare)
    taxes: parseFloat(itemPrice.TaxSummary?.TotalTaxAmount?.['#text'] || itemPrice.TaxSummary?.TotalTaxAmount || 0), // → FE: price breakdown (taxes & fees)
  };

  // ── Resolve restrictions from FareComponent (CancelRestrictions / ChangeRestrictions) ──
  const flexibility = extractTkRestrictions(offerItems);

  // ── Resolve included services ──
  const includedServices = extractTkServices(offerItems, maps.serviceDefMap);

  // Enhance flexibility flags from included services (some airlines communicate refundable/changeable via services)
  if (!flexibility.refundable && includedServices.some((s) => s.name?.toUpperCase().includes('REFUNDABLE'))) {
    flexibility.refundable = true;
  }
  if (!flexibility.changeable && includedServices.some((s) => s.name?.toUpperCase().includes('CHANGEABLE'))) {
    flexibility.changeable = true;
  }

  // ── Extract RBD from FareComponent ──
  const fareComponents = [];
  offerItems.forEach((item) => {
    toArray(item.FareDetail).forEach((fd) => {
      toArray(fd.FareComponent).forEach((fc) => {
        fareComponents.push(fc);
      });
    });
  });
  const rbdCode = fareComponents[0]?.RBD?.RBD_Code || priceClass?.Code || '';

  const fareDetails = {
    cabinClass: priceClass?.CabinType?.CabinTypeCode || '3',                                           // → FE: cabin tier indicator (e.g. "3"=economy, "2"=business)
    cabinName: priceClass?.CabinType?.CabinTypeName || deriveCabinName(priceClass?.CabinType?.CabinTypeCode), // → FE: cabin label shown on fare card (e.g. "ECONOMY")
    priceClassName: priceClass?.Name || '',                                                             // → FE: fare brand name on fare card (e.g. "Eco Fly", "Flex Fly")
    bookingClass: rbdCode,                                                                             // → FE (future): booking class letter (e.g. "V")
    fareBasis: priceClass?.FareBasisCode || '',                                                         // → FE (future): fare basis code (e.g. "VS2XPX")
    baggage,                                                                                           // → FE: baggage allowance icons/labels (see sub-fields below)
    flexibility,                                                                                       // → FE: refundable/changeable badges (see sub-fields below)
    includedServices,                                                                                  // → FE: list of included fare features (e.g. "CABIN BAGGAGE", "MEAL SERVICE")
  };

  // Build flight group key for grouping offers sharing the same flights
  const flightGroupKey = segments.map((s) => `${s.flightNumber}-${s.departureTime}`).join('|');

  // Detect cabinBag from included services (some airlines communicate cabin bag as a service, not via BaggageAssociations)
  if (!baggage.cabinBag && includedServices.some((s) => s.name?.toUpperCase().includes('CABIN BAGGAGE'))) {
    baggage.cabinBag = true;
  }

  // Build per-OfferItem → PaxRefID mapping (needed for multi-pax OfferPrice/OrderCreate)
  const offerItemPaxRefs = offerItems.map((item) => {
    const paxRefIds = new Set();
    toArray(item.Service).forEach((svc) => {
      const refs = svc.OfferServiceAssociation?.PaxRefID;
      if (refs) toArray(refs).forEach((id) => paxRefIds.add(id));
    });
    return { offerItemId: item.OfferItemID, paxIds: [...paxRefIds] };
  });

  // All ndcReferences are INTERNAL — stored in searchContextStore, used by repricing/booking services
  const ndcReferences = {
    offerId,                                                                                           // offer ID for OfferPriceRQ
    ownerCode,                                                                                         // airline owner for routing
    offerItemIds: offerItems.map((item) => item.OfferItemID),                                          // offer item IDs for OfferPriceRQ
    offerItemPaxRefs,                                                                                  // per-item pax mapping for multi-pax requests
    paxIds: maps.paxIds,                                                                               // passenger refs for OfferPriceRQ
    paxSegmentIds: segments.map((s) => s.paxSegmentId),                                                // segment refs
    priceClassId: priceClassRef,                                                                       // price class ref
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

// ── NDC 21.x-specific helpers ──

/**
 * Derive cabin name from IATA PADIS CabinTypeCode
 * NDC 21.x uses: 2 = BUSINESS, 3 = ECONOMY (no Premium Economy distinction at code level)
 */
const deriveCabinName = (cabinTypeCode) => {
  if (!cabinTypeCode) return 'Economy';
  const map = { '1': 'First', '2': 'Business', '3': 'Economy', '4': 'Economy' };
  return map[String(cabinTypeCode)] || 'Economy';
};

/**
 * Resolve baggage from NDC 21.x Offer.BaggageAssociations
 * Structure: BaggageAssociations { BaggageAllowanceRefID, ... }
 * BaggageAllowance: { TypeCode (Checked), PieceAllowance { TotalQty }, WeightAllowance { MaximumWeightMeasure, WeightUnitOfMeasurement } }
 */
const resolveTkBaggage = (baggageAssociations, baggageMap) => {
  const result = { personalItem: true, checkedBags: 0, checkedBagWeight: null, cabinBag: false };

  baggageAssociations.forEach((assoc) => {
    const refId = assoc.BaggageAllowanceRefID;
    if (!refId) return;
    const ba = baggageMap[refId];
    if (!ba) return;

    const typeCode = (ba.TypeCode || '').toLowerCase();
    const pieces = parseInt(ba.PieceAllowance?.TotalQty || 0, 10);
    const maxWeight = ba.WeightAllowance?.MaximumWeightMeasure;
    const weightUnit = ba.WeightAllowance?.WeightUnitOfMeasurement || 'KGM';
    const weightStr = maxWeight ? `${maxWeight} ${weightUnit === 'KGM' ? 'kg' : weightUnit}` : null;

    if (typeCode === 'checked' || typeCode === '') {
      result.checkedBags = pieces;
      if (weightStr) result.checkedBagWeight = weightStr;
    } else if (typeCode === 'carryon' || typeCode === 'cabin') {
      result.cabinBag = true;
    }
  });

  return result;
};

/**
 * Extract cancel/change restrictions from NDC 21.x FareComponent
 * Structure: FareComponent > CancelRestrictions[] and ChangeRestrictions[]
 * Each has: { AllowedModificationInd, DescText, Fee { Amount @_CurCode }, JourneyStageCode }
 */
const extractTkRestrictions = (offerItems) => {
  const result = {
    refundable: false,
    changeable: false,
    cancelRestrictions: [],
    changeRestrictions: [],
  };

  offerItems.forEach((item) => {
    toArray(item.FareDetail).forEach((fd) => {
      toArray(fd.FareComponent).forEach((fc) => {
        // CancelRestrictions
        toArray(fc.CancelRestrictions).forEach((cr) => {
          const allowed = cr.AllowedModificationInd === 'true' || cr.AllowedModificationInd === true;
          if (allowed && !result.refundable) result.refundable = true;
          result.cancelRestrictions.push({
            allowed,
            description: cr.DescText || '',
            fee: cr.Fee?.Amount?.['#text'] || cr.Fee?.Amount || null,
            currency: cr.Fee?.Amount?.['@_CurCode'] || null,
            stage: cr.JourneyStageCode || '',
          });
        });

        // ChangeRestrictions
        toArray(fc.ChangeRestrictions).forEach((cr) => {
          const allowed = cr.AllowedModificationInd === 'true' || cr.AllowedModificationInd === true;
          if (allowed && !result.changeable) result.changeable = true;
          result.changeRestrictions.push({
            allowed,
            description: cr.DescText || '',
            fee: cr.Fee?.Amount?.['#text'] || cr.Fee?.Amount || null,
            currency: cr.Fee?.Amount?.['@_CurCode'] || null,
            stage: cr.JourneyStageCode || '',
          });
        });
      });
    });
  });

  return result;
};

/**
 * Extract included services from NDC 21.x OfferItem.Service[]
 * Structure: Service > OfferServiceAssociation > ServiceDefinitionRef > ServiceDefinitionRefID
 * → resolves to ServiceDefinitionList > ServiceDefinition { Name, Desc { DescText }, RFISC }
 */
const extractTkServices = (offerItems, serviceDefMap) => {
  const services = [];
  const seen = new Set();

  offerItems.forEach((item) => {
    toArray(item.Service).forEach((svc) => {
      const svcDefRef = svc.OfferServiceAssociation?.ServiceDefinitionRef?.ServiceDefinitionRefID;
      if (!svcDefRef || seen.has(svcDefRef)) return;
      seen.add(svcDefRef);

      const svcDef = serviceDefMap[svcDefRef];
      if (svcDef) {
        services.push({
          id: svcDefRef,
          name: svcDef.Name || '',
          description: svcDef.Desc?.DescText || '',
          rfisc: svcDef.RFISC || '',
        });
      }
    });
  });

  return services;
};
