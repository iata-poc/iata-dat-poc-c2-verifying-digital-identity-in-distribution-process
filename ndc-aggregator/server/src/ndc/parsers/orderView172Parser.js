import { XMLParser } from 'fast-xml-parser';
import { AppError } from '../../appError.js';

/**
 * Parse NDC 17.2 OrderViewRS XML response
 * Returned after OrderCreateRQ.
 *
 * NDC 17.2 structure: OrderViewRS > Response > Order { OrderID, StatusCode,
 *   TotalOrderPrice, OrderItem[], Passengers, DataLists }
 *
 * @param {string} xmlResponse - XML response from airline
 * @param {string} airlineCode - IATA airline code
 * @returns {object} Parsed order details
 */
export const parseOrderView172RS = (xmlResponse, airlineCode) => {
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
    console.error('[OrderView172Parser] XML parsing error:', error);
    throw new AppError({
      statusCode: 502,
      msg: `Failed to parse ${airlineCode} OrderView response: ${error.message}`,
    });
  }

  // NDC 17.2 root can be OrderViewRS or OrderCreateRS
  let rs = parsedData.OrderViewRS || parsedData.OrderCreateRS || parsedData;
  if (Array.isArray(rs)) rs = rs[0];

  // Check for errors
  if (rs.Errors || rs.Error) {
    const errorMsg = extractErrorMessage(rs);
    throw new AppError({
      statusCode: 502,
      msg: `${airlineCode} OrderView returned error: ${errorMsg}`,
    });
  }

  const order = extractOrder172(rs, airlineCode);

  return {
    airlineCode,
    order,
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

const buildMap = (arr, keyFn) => {
  const map = {};
  toArray(arr).forEach((item) => {
    const key = keyFn(item);
    if (key) map[key] = item;
  });
  return map;
};

/**
 * Extract order from NDC 17.2 OrderViewRS / OrderCreateRS
 */
const extractOrder172 = (rs, airlineCode) => {
  // Order can be at root, under Response, or under Orders
  const orderData =
    rs.Order ||
    rs.Response?.Order ||
    rs.Orders?.Order ||
    null;

  if (!orderData) {
    throw new AppError({
      statusCode: 502,
      msg: `${airlineCode} OrderView response missing Order`,
    });
  }

  const order = Array.isArray(orderData) ? orderData[0] : orderData;

  const ndcOrderId = order['@_OrderID'] || order.OrderID || '';
  const ownerCode = order['@_Owner'] || order.OwnerCode || airlineCode;
  const status = extractOrderStatus172(order);
  const createdAt = order.CreationDateTime || order['@_TimeStamp'] || null;

  // ── Total price ──
  // Variant A uses DetailCurrencyPrice > Total[@Code]; Variant B uses SimpleCurrencyPrice[@Code]
  const detailPrice = order.TotalOrderPrice?.DetailCurrencyPrice || order.TotalPrice?.DetailCurrencyPrice;
  const simplePrice = order.TotalOrderPrice?.SimpleCurrencyPrice || order.TotalPrice?.SimpleCurrencyPrice;
  let totalAmount, baseAmount, taxAmount;
  if (detailPrice) {
    totalAmount = parseAmount172(detailPrice.Total);
    baseAmount = parseAmount172(detailPrice.Details?.Detail?.SubTotal);
    taxAmount = parseAmount172(detailPrice.Taxes?.Total);
  } else if (simplePrice) {
    totalAmount = parseAmount172(simplePrice);
    baseAmount = { value: 0, currency: totalAmount.currency };
    taxAmount = { value: 0, currency: totalAmount.currency };
  } else {
    totalAmount = { value: 0, currency: 'USD' };
    baseAmount = { value: 0, currency: 'USD' };
    taxAmount = { value: 0, currency: 'USD' };
  }

  const price = {
    total: totalAmount.value,
    currency: totalAmount.currency,
    base: baseAmount.value,
    taxes: taxAmount.value,
  };

  // ── Booking reference ──
  const orderItems = toArray(order.OrderItem);
  let bookingReference = '';
  let paymentTimeLimit = null;
  for (const item of orderItems) {
    // BookingRef can be on OrderItem or on OrderItem > Service
    if (!bookingReference) {
      if (item.BookingRef?.BookingID) {
        bookingReference = item.BookingRef.BookingID;
      }
      for (const svc of toArray(item.Service)) {
        if (svc.BookingRef?.BookingID) {
          bookingReference = svc.BookingRef.BookingID;
          break;
        }
      }
    }
    if (!paymentTimeLimit) {
      paymentTimeLimit =
        item.PaymentTimeLimitDateTime ||
        item.TimeLimits?.OtherLimits?.OtherLimit?.TicketByTimeLimit?.TicketBy ||
        null;
    }
  }

  // ── Resolve segments from DataLists ──
  const dataLists = rs.DataLists || rs.Response?.DataLists || order.DataLists || {};
  const segments = resolveSegments172(dataLists, airlineCode);

  // ── Extract passengers ──
  const passengers = extractPassengers172(rs, order);

  return {
    ndcOrderId,
    bookingReference,
    ownerCode,
    status,
    createdAt,
    totalPrice: price,
    paymentTimeLimit,
    passengers,
    segments,
  };
};

/**
 * Extract order status from NDC 17.2
 * Some variants may use StatusCode or OrderStatus or @Status
 */
const extractOrderStatus172 = (order) => {
  const raw = (
    order.StatusCode ||
    order.OrderStatus ||
    order['@_Status'] ||
    ''
  ).toUpperCase();

  if (raw === 'OPENED' || raw === 'CREATED' || raw === 'CONFIRMED') return 'CONFIRMED';
  if (raw === 'CLOSED' || raw === 'TICKETED') return 'TICKETED';
  if (raw === 'CANCELLED') return 'CANCELLED';
  return raw || 'CONFIRMED';
};

/**
 * Resolve segments from NDC 17.2 DataLists (FlightSegmentList + FlightList + OriginDestinationList)
 * Same 2-level chain as AirShopping: Flight → FlightSegment
 */
const resolveSegments172 = (dataLists, airlineCode) => {
  const segmentMap = buildMap(
    dataLists.FlightSegmentList?.FlightSegment,
    (s) => s['@_SegmentKey']
  );
  const flightMap = buildMap(
    dataLists.FlightList?.Flight,
    (f) => f['@_FlightKey']
  );

  // Build OD index for journey direction
  const flightKeyToOdIndex = {};
  toArray(dataLists.OriginDestinationList?.OriginDestination).forEach((od, idx) => {
    const flightKeys = (od.FlightReferences || '').toString().split(/\s+/).filter(Boolean);
    flightKeys.forEach((fk) => { flightKeyToOdIndex[fk] = idx; });
  });

  const segments = [];
  const seenSegKeys = new Set();

  Object.entries(flightMap).forEach(([flightKey, flight]) => {
    const odIndex = flightKeyToOdIndex[flightKey] || 0;
    const journeyDirection = odIndex >= 1 ? 'inbound' : 'outbound';

    const segKeys = (flight.SegmentReferences || '').toString().split(/\s+/).filter(Boolean);
    segKeys.forEach((segKey) => {
      if (seenSegKeys.has(segKey)) return;
      seenSegKeys.add(segKey);

      const seg = segmentMap[segKey];
      if (!seg) return;

      const mktCarrier = seg.MarketingCarrier || {};
      const opCarrier = seg.OperatingCarrier || {};
      const dep = seg.Departure || {};
      const arr = seg.Arrival || {};

      segments.push({
        paxSegmentId: segKey,
        flightNumber: `${mktCarrier.AirlineID || airlineCode}${mktCarrier.FlightNumber || ''}`,
        departureAirport: dep.AirportCode || '',
        departureTime: combineDateAndTime(dep.Date, dep.Time),
        departureStation: '',
        departureTerminal: dep.Terminal?.Name || '',
        arrivalAirport: arr.AirportCode || '',
        arrivalTime: combineDateAndTime(arr.Date, arr.Time),
        arrivalStation: '',
        arrivalTerminal: arr.Terminal?.Name || '',
        duration: seg.FlightDetail?.FlightDuration?.Value || flight.Journey?.Time || null,
        carrierCode: mktCarrier.AirlineID || airlineCode,
        operatingCarrier: opCarrier.AirlineID || mktCarrier.AirlineID || airlineCode,
        aircraft: seg.Equipment?.AircraftCode || '',
        aircraftName: '',
        cabinClass: seg.ClassOfService?.MarketingName?.['@_CabinDesignator'] || '',
        cabinName: seg.ClassOfService?.MarketingName?.['#text'] || seg.ClassOfService?.MarketingName || '',
        rbdCode: mktCarrier.ResBookDesigCode || '',
        journeyDirection,
      });
    });
  });

  return segments;
};

const combineDateAndTime = (date, time) => {
  if (!date) return '';
  if (!time) return date;
  return `${date}T${time}`;
};

/**
 * Extract passengers from NDC 17.2 response
 * Passengers can be in: rs.Passengers, order.Passengers, DataLists.PassengerList
 */
const extractPassengers172 = (rs, order) => {
  const paxSource =
    rs.Passengers?.Passenger ||
    order.Passengers?.Passenger ||
    rs.DataLists?.PassengerList?.Passenger ||
    rs.Response?.DataLists?.PassengerList?.Passenger ||
    [];

  return toArray(paxSource).map((pax) => {
    const individual = pax.Individual || {};
    const doc = pax.IdentityDocument || pax.IdentityDoc || {};

    return {
      passengerId: pax['@_PassengerID'] || '',
      type: pax.PTC || 'ADT',
      title: individual.Title || individual.TitleName || '',
      firstName: individual.GivenName || '',
      lastName: individual.Surname || '',
      dateOfBirth: individual.Birthdate || pax.Birthdate || '',
      gender: individual.Gender || individual.GenderCode || '',
      document: {
        type: doc.IdentityDocumentType || doc.IdentityDocTypeCode || 'PT',
        number: doc.IdentityDocumentNumber || doc.IdentityDocID || '',
        expiryDate: doc.ExpiryDate || '',
        issuingCountry: doc.IssuingCountryCode || '',
        citizenshipCountry: doc.CitizenshipCountryCode || '',
      },
    };
  });
};
