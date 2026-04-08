import { AppError } from '../appError.js';
import { handleAirlineAxiosError, createAirlineError, NDC_ERROR_CODES } from '../ndcErrors.js';
import { getAirlineClients, getEnabledAirlineCodes } from '../ndc/clients.js';

/**
 * NDC Aggregator Service
 * Manages multiple airline NDC clients and aggregates their responses
 */

/**
 * Check if an axios error represents a VP/Hopae verification failure.
 * Type 1 — In-band XML error containing DIGITAL_ID_VP_IS_REVOKED_ERROR
 * Type 2 — HTTP 403 status code
 * @param {object} error - Axios error
 * @returns {{ revoked: boolean, reason: string } | null}
 */
const detectVpRevocation = (error) => {
  const responseData = typeof error.response?.data === 'string' ? error.response.data : '';

  if (responseData.includes('DIGITAL_ID_VP_IS_REVOKED_ERROR')) {
    return { revoked: true, reason: 'DIGITAL_ID_VP_IS_REVOKED_ERROR' };
  }

  if (error.response?.status === 403) {
    return { revoked: true, reason: 'QR HTTP 403' };
  }

  return null;
};

/**
 * Get list of enabled airline codes
 * @returns {string[]} Array of enabled airline codes
 */
const getEnabledAirlines = () => {
  return getEnabledAirlineCodes();
};

/**
 * Get client for specific airline
 * @param {string} airlineCode - IATA airline code
 * @returns {object} Airline client
 */
const getAirlineClient = (airlineCode) => {
  const clients = getAirlineClients();
  const client = clients[airlineCode];
  
  if (!client) {
    throw new AppError({
      statusCode: 400,
      msg: `Unsupported airline: ${airlineCode}`,
    });
  }
  
  return client;
};

/**
 * Execute AirShopping across all enabled airlines
 * @param {function} buildRequestXml - Function to build airline-specific XML
 * @param {object} searchParams - Search parameters
 * @param {object} vpData - VP data for injection
 * @returns {Promise<Array>} Array of offers from all airlines
 */
const executeAirShopping = async (buildRequestXml, searchParams, vpData) => {
  const enabledAirlines = getEnabledAirlines();
  
  if (enabledAirlines.length === 0) {
    throw new AppError({
      statusCode: 500,
      msg: 'No airlines enabled for NDC integration',
    });
  }

  console.log(`[NDC Aggregator] Executing AirShopping for airlines: ${enabledAirlines.join(', ')}`);

  // Execute shopping requests for all airlines in parallel
  const promises = enabledAirlines.map(async (airlineCode) => {
    try {
      const client = getAirlineClient(airlineCode);
      
      // Build airline-specific XML request
      const requestXml = buildRequestXml(searchParams, vpData, airlineCode);
      
      console.log(`[NDC Aggregator] Calling ${airlineCode} AirShopping...`);
      const response = await client.airShopping(requestXml);
      
      console.log(`[NDC Aggregator] ${airlineCode} AirShopping successful`);
      return {
        airlineCode,
        success: true,
        response: response.data,
      };
    } catch (error) {
      const vpCheck = detectVpRevocation(error);
      if (vpCheck) {
        console.warn(`[NDC Aggregator] ${airlineCode}: VP credentials are revoked (${vpCheck.reason}). Returning empty result.`);
        return { airlineCode, success: true, response: '', vpRevoked: true };
      }

      console.error(`[NDC Aggregator] ${airlineCode} AirShopping failed:`, {
        message: error.message,
        httpStatus: error.response?.status,
        responseSnippet: typeof error.response?.data === 'string' ? error.response.data.substring(0, 500) : undefined,
        code: error.code,
      });
      const ndcError = handleAirlineAxiosError(airlineCode, error);
      return {
        airlineCode,
        success: false,
        error: ndcError.msg,
      };
    }
  });

  const results = await Promise.all(promises);

  // Log failures but don't throw — let the route return empty flights with a user-friendly message
  const successfulResults = results.filter((r) => r.success);
  if (successfulResults.length === 0) {
    console.warn('[NDC Aggregator] All airline NDC requests failed:', results.map((r) => ({ airline: r.airlineCode, error: r.error })));
  }

  return results;
};

/**
 * Execute OfferPrice for specific airline
 * @param {string} airlineCode - Airline code
 * @param {function} buildRequestXml - Function to build XML
 * @param {object} offerData - Offer data including NDC references
 * @param {object} vpData - VP data for injection
 * @returns {Promise<object>} Parsed response
 */
const executeOfferPrice = async (airlineCode, buildRequestXml, offerData, vpData) => {
  console.log(`[NDC Aggregator] Executing OfferPrice for ${airlineCode}`);

  const client = getAirlineClient(airlineCode);
  const requestXml = buildRequestXml(offerData, vpData, airlineCode);

  try {
    const response = await client.offerPrice(requestXml);
    console.log(`[NDC Aggregator] ${airlineCode} OfferPrice successful`);
    return {
      airlineCode,
      success: true,
      response: response.data,
    };
  } catch (error) {
    console.error(`[NDC Aggregator] ${airlineCode} OfferPrice failed:`, {
      message: error.message,
      httpStatus: error.response?.status,
      responseSnippet: typeof error.response?.data === 'string' ? error.response.data.substring(0, 500) : undefined,
      code: error.code,
    });

    const vpCheck = detectVpRevocation(error);
    if (vpCheck) {
      console.warn(`[NDC Aggregator] ${airlineCode}: VP credentials are revoked (${vpCheck.reason}).`);
      throw new AppError({ statusCode: 403, msg: `${airlineCode}: VP credentials are revoked.` });
    }

    throw new AppError({
      statusCode: error.response?.status || 502,
      msg: `${airlineCode} OfferPrice failed: ${error.message}`,
    });
  }
};

/**
 * Execute OrderCreate for specific airline
 * @param {string} airlineCode - Airline code
 * @param {function} buildRequestXml - Function to build XML
 * @param {object} orderData - Order data including offer and passengers
 * @param {object} vpData - VP data for injection
 * @returns {Promise<object>} Parsed response
 */
const executeOrderCreate = async (airlineCode, buildRequestXml, orderData, vpData) => {
  console.log(`[NDC Aggregator] Executing OrderCreate for ${airlineCode}`);

  const client = getAirlineClient(airlineCode);
  const requestXml = buildRequestXml(orderData, vpData, airlineCode);

  try {
    const response = await client.orderCreate(requestXml);
    console.log(`[NDC Aggregator] ${airlineCode} OrderCreate successful`);
    return {
      airlineCode,
      success: true,
      response: response.data,
    };
  } catch (error) {
    console.error(`[NDC Aggregator] ${airlineCode} OrderCreate failed:`, {
      message: error.message,
      httpStatus: error.response?.status,
      responseSnippet: typeof error.response?.data === 'string' ? error.response.data.substring(0, 500) : undefined,
      code: error.code,
    });

    const vpCheck = detectVpRevocation(error);
    if (vpCheck) {
      console.warn(`[NDC Aggregator] ${airlineCode}: VP credentials are revoked (${vpCheck.reason}).`);
      throw new AppError({ statusCode: 403, msg: `${airlineCode}: VP credentials are revoked.` });
    }

    throw new AppError({
      statusCode: error.response?.status || 502,
      msg: `${airlineCode} OrderCreate failed: ${error.message}`,
    });
  }
};

/**
 * Execute OrderView for specific airline
 * @param {string} airlineCode - Airline code
 * @param {string} orderId - Internal or NDC order ID
 * @param {function} buildRequestXml - Function to build XML
 * @param {object} vpData - VP data for injection
 * @returns {Promise<object>} Parsed response
 */
const executeOrderView = async (airlineCode, orderId, buildRequestXml, vpData) => {
  console.log(`[NDC Aggregator] Executing OrderView for ${airlineCode}, orderId: ${orderId}`);

  const client = getAirlineClient(airlineCode);
  const requestXml = buildRequestXml(vpData, airlineCode);

  try {
    const response = await client.orderView(orderId, requestXml);
    console.log(`[NDC Aggregator] ${airlineCode} OrderView successful`);
    return {
      airlineCode,
      success: true,
      response: response.data,
    };
  } catch (error) {
    console.error(`[NDC Aggregator] ${airlineCode} OrderView failed:`, {
      message: error.message,
      httpStatus: error.response?.status,
      responseSnippet: typeof error.response?.data === 'string' ? error.response.data.substring(0, 500) : undefined,
      code: error.code,
    });

    const vpCheck = detectVpRevocation(error);
    if (vpCheck) {
      console.warn(`[NDC Aggregator] ${airlineCode}: VP credentials are revoked (${vpCheck.reason}).`);
      throw new AppError({ statusCode: 403, msg: `${airlineCode}: VP credentials are revoked.` });
    }

    throw new AppError({
      statusCode: error.response?.status || 502,
      msg: `${airlineCode} OrderView failed: ${error.message}`,
    });
  }
};

export const ndcAggregatorService = {
  executeAirShopping,
  executeOfferPrice,
  executeOrderCreate,
  executeOrderView,
  getEnabledAirlines,
};
