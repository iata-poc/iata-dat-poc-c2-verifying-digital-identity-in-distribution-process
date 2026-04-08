import { AppError } from './appError.js';

/**
 * NDC-specific error codes and factory functions
 */

export const NDC_ERROR_CODES = {
  // Search errors
  SEARCH_NO_RESULTS: 'NDC_SEARCH_NO_RESULTS',
  SEARCH_INVALID_PARAMS: 'NDC_SEARCH_INVALID_PARAMS',
  SEARCH_CONTEXT_EXPIRED: 'NDC_SEARCH_CONTEXT_EXPIRED',
  
  // Offer errors
  OFFER_NOT_FOUND: 'NDC_OFFER_NOT_FOUND',
  OFFER_EXPIRED: 'NDC_OFFER_EXPIRED',
  OFFER_PRICE_CHANGED: 'NDC_OFFER_PRICE_CHANGED',
  OFFER_NOT_AVAILABLE: 'NDC_OFFER_NOT_AVAILABLE',
  
  // Order errors
  ORDER_CREATION_FAILED: 'NDC_ORDER_CREATION_FAILED',
  ORDER_NOT_FOUND: 'NDC_ORDER_NOT_FOUND',
  ORDER_INVALID_PASSENGERS: 'NDC_ORDER_INVALID_PASSENGERS',
  ORDER_PAYMENT_FAILED: 'NDC_ORDER_PAYMENT_FAILED',
  
  // Airline errors
  AIRLINE_NOT_SUPPORTED: 'NDC_AIRLINE_NOT_SUPPORTED',
  AIRLINE_SERVICE_ERROR: 'NDC_AIRLINE_SERVICE_ERROR',
  AIRLINE_TIMEOUT: 'NDC_AIRLINE_TIMEOUT',
  AIRLINE_NO_INVENTORY: 'NDC_AIRLINE_NO_INVENTORY',
  
  // VP/Authentication errors
  VP_MISSING: 'NDC_VP_MISSING',
  VP_INVALID: 'NDC_VP_INVALID',
  VP_EXPIRED: 'NDC_VP_EXPIRED',
  AGENT_PROFILE_MISSING: 'NDC_AGENT_PROFILE_MISSING',
  
  // XML parsing errors
  XML_PARSE_ERROR: 'NDC_XML_PARSE_ERROR',
  XML_BUILD_ERROR: 'NDC_XML_BUILD_ERROR',
  XML_VALIDATION_ERROR: 'NDC_XML_VALIDATION_ERROR',
};

/**
 * Create search-related error
 */
export const createSearchError = (code, message, details = null) => {
  const statusCode = code === NDC_ERROR_CODES.SEARCH_NO_RESULTS ? 404 : 400;
  return new AppError({
    statusCode,
    msg: message || 'Search error',
    details: { errorCode: code, ...details },
  });
};

/**
 * Create offer-related error
 */
export const createOfferError = (code, message, details = null) => {
  let statusCode = 400;
  if (code === NDC_ERROR_CODES.OFFER_NOT_FOUND) statusCode = 404;
  if (code === NDC_ERROR_CODES.OFFER_EXPIRED) statusCode = 410;
  if (code === NDC_ERROR_CODES.OFFER_NOT_AVAILABLE) statusCode = 409;
  
  return new AppError({
    statusCode,
    msg: message || 'Offer error',
    details: { errorCode: code, ...details },
  });
};

/**
 * Create order-related error
 */
export const createOrderError = (code, message, details = null) => {
  let statusCode = 400;
  if (code === NDC_ERROR_CODES.ORDER_NOT_FOUND) statusCode = 404;
  if (code === NDC_ERROR_CODES.ORDER_CREATION_FAILED) statusCode = 502;
  
  return new AppError({
    statusCode,
    msg: message || 'Order error',
    details: { errorCode: code, ...details },
  });
};

/**
 * Create airline-related error
 */
export const createAirlineError = (airlineCode, code, message, details = null) => {
  let statusCode = 502;
  if (code === NDC_ERROR_CODES.AIRLINE_NOT_SUPPORTED) statusCode = 400;
  if (code === NDC_ERROR_CODES.AIRLINE_TIMEOUT) statusCode = 504;
  if (code === NDC_ERROR_CODES.AIRLINE_NO_INVENTORY) statusCode = 409;
  
  return new AppError({
    statusCode,
    msg: message || `${airlineCode} service error`,
    details: { errorCode: code, airlineCode, ...details },
  });
};

/**
 * Parse NDC error response from airline
 */
export const parseNdcError = (airlineCode, xmlResponse, defaultMessage = 'NDC request failed') => {
  try {
    // Extract error information from XML response
    // This is a simplified version - actual parsing may need xml parser
    if (typeof xmlResponse === 'string') {
      if (xmlResponse.includes('NO_AVAILABILITY') || xmlResponse.includes('SOLD_OUT')) {
        return createAirlineError(
          airlineCode,
          NDC_ERROR_CODES.AIRLINE_NO_INVENTORY,
          `${airlineCode}: No seats available`,
          { rawError: xmlResponse.substring(0, 200) }
        );
      }
      
      if (xmlResponse.includes('PRICE_CHANGED')) {
        return createOfferError(
          NDC_ERROR_CODES.OFFER_PRICE_CHANGED,
          `${airlineCode}: Offer price has changed`,
          { airlineCode }
        );
      }
      
      if (xmlResponse.includes('EXPIRED') || xmlResponse.includes('NOT_AVAILABLE')) {
        return createOfferError(
          NDC_ERROR_CODES.OFFER_EXPIRED,
          `${airlineCode}: Offer has expired`,
          { airlineCode }
        );
      }
    }
  } catch (error) {
    console.error('[NDC Error Parser] Failed to parse error:', error);
  }
  
  // Default generic error
  return createAirlineError(
    airlineCode,
    NDC_ERROR_CODES.AIRLINE_SERVICE_ERROR,
    `${airlineCode}: ${defaultMessage}`
  );
};

/**
 * Handle axios errors from airline clients
 */
export const handleAirlineAxiosError = (airlineCode, error) => {
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return createAirlineError(
      airlineCode,
      NDC_ERROR_CODES.AIRLINE_TIMEOUT,
      `${airlineCode} request timed out`
    );
  }
  
  if (error.response) {
    // Server responded with error status
    const status = error.response.status;
    if (status >= 500) {
      return createAirlineError(
        airlineCode,
        NDC_ERROR_CODES.AIRLINE_SERVICE_ERROR,
        `${airlineCode} service unavailable (${status})`,
        { httpStatus: status }
      );
    }
    
    // Try to parse NDC error from response
    return parseNdcError(airlineCode, error.response.data, error.message);
  }
  
  // Network error or no response
  return createAirlineError(
    airlineCode,
    NDC_ERROR_CODES.AIRLINE_SERVICE_ERROR,
    `${airlineCode}: ${error.message}`
  );
};
