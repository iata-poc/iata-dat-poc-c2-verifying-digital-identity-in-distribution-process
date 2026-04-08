import { createOAuthRestTransport } from './oauthRestTransport.js';
import { createSoapApiKeyTransport } from './soapApiKeyTransport.js';
import { createSoapSubscriptionTransport } from './soapSubscriptionTransport.js';

/**
 * Transport registry — maps transport type identifiers to factory functions.
 * Each factory has the signature: (airlineCode, airlineConfig) => ndcClient
 */
export const transportRegistry = {
  'oauth-rest': createOAuthRestTransport,
  'soap-apikey': createSoapApiKeyTransport,
  'soap-subscription': createSoapSubscriptionTransport,
};

/**
 * Create an NDC transport client for a given airline config.
 * @param {string} airlineCode - IATA airline code
 * @param {object} airlineConfig - Airline configuration (must include `transport` key)
 * @returns {object} NDC client with airShopping, offerPrice, orderCreate, orderView methods
 */
export const createTransport = (airlineCode, airlineConfig) => {
  const factory = transportRegistry[airlineConfig.transport];
  if (!factory) {
    throw new Error(`Unknown transport type "${airlineConfig.transport}" for airline ${airlineCode}`);
  }
  return factory(airlineCode, airlineConfig);
};
