import { XMLParser } from 'fast-xml-parser';
import { AppError } from '../../appError.js';
import { parseOrderView172RS } from './orderView172Parser.js';

/**
 * Parse NDC OrderViewRS / OrderCreateRS XML response
 * Auto-detects NDC 21.x vs 17.2 format.
 *
 * @param {string} xmlResponse - XML response from airline
 * @param {string} airlineCode - IATA airline code
 * @returns {object} Parsed order details
 */
export const parseOrderViewRS = (xmlResponse, airlineCode) => {
  // Detect NDC 17.2 format vs IATA 21.x format
  const is172 =
    (xmlResponse.includes('<OrderViewRS') || xmlResponse.includes('<OrderCreateRS')) &&
    !xmlResponse.includes('<IATA_OrderViewRS');

  if (is172) {
    console.log(`[OrderViewParser] Detected NDC 17.2 format for ${airlineCode}, delegating to 17.2 parser`);
    return parseOrderView172RS(xmlResponse, airlineCode);
  }

  console.log(`[OrderViewParser] Detected IATA 21.36 format for ${airlineCode}`);

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
    console.error('[OrderViewParser] XML parsing error:', error);
    throw new AppError({
      statusCode: 502,
      msg: `Failed to parse ${airlineCode} OrderView response: ${error.message}`,
    });
  }

  const response = parsedData.IATA_OrderViewRS || parsedData;

  // Check for errors in response
  if (response.Error || response.Errors) {
    const errorMsg = extractErrorMessage(response);
    throw new AppError({
      statusCode: 502,
      msg: `${airlineCode} OrderView returned error: ${errorMsg}`,
    });
  }

  // Extract order details
  const order = extractOrder(response, airlineCode);

  return {
    airlineCode,
    order,
    metadata: {
      timestamp: response.PayloadAttributes?.Timestamp || new Date().toISOString(),
      correlationId: response.PayloadAttributes?.CorrelationID || null,
    },
  };
};

const toArray = (val) => {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
};

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

const buildMap = (arr, keyFn) => {
  const map = {};
  toArray(arr).forEach((item) => {
    const key = keyFn(item);
    if (key) map[key] = item;
  });
  return map;
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
 * Extract order details from NDC 21.x OrderViewRS
 */
const extractOrder = (response, airlineCode) => {
  const orderData = response.Response?.Order;
  
  if (!orderData) {
    throw new AppError({
      statusCode: 502,
      msg: `${airlineCode} OrderView response missing Order`,
    });
  }

  // DataLists is a sibling of Order inside Response
  const dataLists = response.Response?.DataLists || {};

  // Build segment resolution maps (same chain as AirShoppingRS)
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

  // Build OriginDest lookup for journey direction
  const journeyToOdIndex = {};
  toArray(dataLists.OriginDestList?.OriginDest).forEach((od, idx) => {
    toArray(od.PaxJourneyRefID).forEach((jid) => {
      journeyToOdIndex[jid] = idx;
    });
  });

  // Order ID
  const ndcOrderId = orderData.OrderID;
  const ownerCode = orderData.OwnerCode || airlineCode;
  const status = extractOrderStatus(orderData);
  const createdAt = orderData.CreationDateTime || null;

  // Total price (on Order.TotalPrice)
  const tp = orderData.TotalPrice || {};
  const totalAmount = parseAmount(tp.TotalAmount);
  const equivAmount = parseAmount(tp.EquivAmount || tp.BaseAmount);
  const taxAmount = parseAmount(tp.TaxSummary?.TotalTaxAmount);
  const price = {
    total: totalAmount.value,
    currency: totalAmount.currency,
    base: equivAmount.value,
    taxes: taxAmount.value,
  };

  // Booking reference (from first OrderItem > Service > BookingRef)
  const orderItems = toArray(orderData.OrderItem);
  let bookingReference = '';
  let paymentTimeLimit = null;
  for (const item of orderItems) {
    if (!bookingReference) {
      for (const svc of toArray(item.Service)) {
        if (svc.BookingRef?.BookingID) {
          bookingReference = svc.BookingRef.BookingID;
          break;
        }
      }
    }
    if (!paymentTimeLimit && item.PaymentTimeLimitDateTime) {
      paymentTimeLimit = item.PaymentTimeLimitDateTime;
    }
  }

  // Resolve segments via PaxJourney chain
  const segments = [];
  const seenSegIds = new Set();
  Object.values(paxJourneyMap).forEach((journey) => {
    const odIndex = journeyToOdIndex[journey.PaxJourneyID];
    const journeyDirection = odIndex >= 1 ? 'inbound' : 'outbound';

    toArray(journey.PaxSegmentRefID).forEach((psRefId) => {
      if (seenSegIds.has(psRefId)) return;
      seenSegIds.add(psRefId);
      const paxSeg = paxSegmentMap[psRefId];
      if (!paxSeg) return;
      const mktSeg = datedMktSegMap[paxSeg.DatedMarketingSegmentRefId];
      if (!mktSeg) return;
      const opSeg = datedOpSegMap[mktSeg.DatedOperatingSegmentRefId];
      const opLeg = opSeg ? datedOpLegMap[opSeg.DatedOperatingLegRefID] : null;

      // Cabin info from PaxSegment (OrderViewRS includes CabinTypeAssociationChoice)
      const cabinType = paxSeg.CabinTypeAssociationChoice?.SegmentCabinType;

      segments.push({
        paxSegmentId: psRefId,
        flightNumber: `${mktSeg.CarrierDesigCode || airlineCode}${mktSeg.MarketingCarrierFlightNumberText || ''}`,
        departureAirport: mktSeg.Dep?.IATA_LocationCode || '',
        departureTime: mktSeg.Dep?.AircraftScheduledDateTime || '',
        departureStation: mktSeg.Dep?.StationName || '',
        departureTerminal: mktSeg.Dep?.TerminalName || '',
        arrivalAirport: mktSeg.Arrival?.IATA_LocationCode || '',
        arrivalTime: mktSeg.Arrival?.AircraftScheduledDateTime || '',
        arrivalStation: mktSeg.Arrival?.StationName || '',
        arrivalTerminal: mktSeg.Arrival?.TerminalName || '',
        duration: opSeg?.Duration || null,
        carrierCode: mktSeg.CarrierDesigCode || airlineCode,
        operatingCarrier: opSeg?.CarrierDesigCode || mktSeg.CarrierDesigCode || airlineCode,
        aircraft: opLeg?.CarrierAircraftType?.CarrierAircraftTypeCode || '',
        aircraftName: opLeg?.CarrierAircraftType?.CarrierAircraftTypeName || '',
        cabinClass: cabinType?.CabinTypeCode || '',
        cabinName: cabinType?.CabinTypeName || '',
        rbdCode: paxSeg.MarketingCarrierRBD_Code || '',
        journeyDirection,
      });
    });
  });

  // Extract passengers from DataLists.PaxList
  const passengers = extractPassengers(dataLists);

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
 * Extract order status from NDC 21.x StatusCode
 * Uses: OPENED, CLOSED, CANCELLED
 */
const extractOrderStatus = (orderData) => {
  const statusCode = (orderData.StatusCode || '').toUpperCase();
  if (statusCode === 'OPENED') return 'CONFIRMED';
  if (statusCode === 'CLOSED') return 'TICKETED';
  if (statusCode === 'CANCELLED') return 'CANCELLED';
  return statusCode || 'CONFIRMED';
};

/**
 * Extract passengers from DataLists.PaxList
 * NDC 21.x Pax: { PaxID, PTC, Individual { Birthdate, GenderCode, GivenName, Surname, TitleName }, IdentityDoc, ContactInfoRefID }
 */
const extractPassengers = (dataLists) => {
  const paxList = toArray(dataLists.PaxList?.Pax);

  return paxList.map((pax) => {
    const individual = pax.Individual || {};
    const identityDoc = pax.IdentityDoc || {};

    return {
      passengerId: pax.PaxID || '',
      type: pax.PTC || 'ADT',
      title: individual.TitleName || '',
      firstName: individual.GivenName || '',
      lastName: individual.Surname || '',
      dateOfBirth: individual.Birthdate || pax.Birthdate || '',
      gender: individual.GenderCode || '',
      document: {
        type: identityDoc.IdentityDocTypeCode || 'PT',
        number: identityDoc.IdentityDocID || '',
        expiryDate: identityDoc.ExpiryDate || '',
        issuingCountry: identityDoc.IssuingCountryCode || '',
        citizenshipCountry: identityDoc.CitizenshipCountryCode || '',
      },
    };
  });
};
