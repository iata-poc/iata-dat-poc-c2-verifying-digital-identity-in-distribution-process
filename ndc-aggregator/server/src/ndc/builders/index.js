import { config } from '../../config.js';
import { buildAirShopping21xRQ } from './ndc21x/airShoppingBuilder.js';
import { buildOfferPrice21xRQ } from './ndc21x/offerPriceBuilder.js';
import { buildOrderCreate21xRQ } from './ndc21x/orderCreateBuilder.js';
import { buildAirShopping172RQ } from './ndc172/airShoppingBuilder.js';
import { buildOfferPrice172RQ } from './ndc172/offerPriceBuilder.js';
import { buildOrderCreate172RQ } from './ndc172/orderCreateBuilder.js';

/**
 * NDC version → builder mapping.
 * Each operation is dispatched by the airline's configured ndcVersion.
 */
const versionBuilders = {
  airShopping: {
    '21.36': buildAirShopping21xRQ,
    '21.3':  buildAirShopping21xRQ,
    '17.2':  buildAirShopping172RQ,
  },
  offerPrice: {
    '21.36': buildOfferPrice21xRQ,
    '21.3':  buildOfferPrice21xRQ,
    '17.2':  buildOfferPrice172RQ,
  },
  orderCreate: {
    '21.36': buildOrderCreate21xRQ,
    '21.3':  buildOrderCreate21xRQ,
    '17.2':  buildOrderCreate172RQ,
  },
};

/**
 * Resolve the NDC version for an airline from config.
 */
const getNdcVersion = (airlineCode) => {
  const key = airlineCode.toLowerCase();
  return config.airlines[key]?.ndcVersion || '21.36';
};

// ── AirShopping ──

export const getAirShoppingBuilder = (airlineCode) => {
  const version = getNdcVersion(airlineCode);
  return versionBuilders.airShopping[version] || buildAirShopping21xRQ;
};

/**
 * AirShopping dispatcher — selects the correct builder based on NDC version.
 * Signature: (params, vpData, airlineCode) => xmlString
 */
export const buildAirShoppingForAirline = (params, vpData, airlineCode) => {
  const builder = getAirShoppingBuilder(airlineCode);
  return builder(params, vpData, airlineCode);
};

// ── OfferPrice ──

export const getOfferPriceBuilder = (airlineCode) => {
  const version = getNdcVersion(airlineCode);
  return versionBuilders.offerPrice[version] || buildOfferPrice21xRQ;
};

/**
 * OfferPrice dispatcher — selects the correct builder based on NDC version.
 * Signature: (offerData, vpData, airlineCode) => xmlString
 */
export const buildOfferPriceForAirline = (offerData, vpData, airlineCode) => {
  const builder = getOfferPriceBuilder(airlineCode);
  return builder(offerData, vpData, airlineCode);
};

// ── OrderCreate ──

export const getOrderCreateBuilder = (airlineCode) => {
  const version = getNdcVersion(airlineCode);
  return versionBuilders.orderCreate[version] || buildOrderCreate21xRQ;
};

/**
 * OrderCreate dispatcher — selects the correct builder based on NDC version.
 * Signature: (orderData, vpData, airlineCode) => xmlString
 */
export const buildOrderCreateForAirline = (orderData, vpData, airlineCode) => {
  const builder = getOrderCreateBuilder(airlineCode);
  return builder(orderData, vpData, airlineCode);
};
