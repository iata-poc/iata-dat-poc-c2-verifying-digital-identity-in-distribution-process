import { createTransport } from './transports/index.js';
import { config } from '../config.js';

/**
 * NDC Clients Registry
 * Instantiates airline transport clients dynamically from config.
 * Transport type (oauth-rest, soap-apikey, soap-subscription) is declared
 * per airline in config.airlines[code].transport.
 */

// Lazily initialized client cache
let clientCache = null;

/**
 * Build all airline clients from config (called once, cached).
 */
const buildClients = () => {
  const clients = {};

  for (const [key, airlineCfg] of Object.entries(config.airlines)) {
    if (!airlineCfg.enabled || !airlineCfg.ndcEndpoint) continue;

    const code = airlineCfg.code || key.toUpperCase();
    try {
      clients[code] = createTransport(code, airlineCfg);
      console.log(`[NDC Clients] ${code} client created (transport: ${airlineCfg.transport})`);
    } catch (err) {
      console.error(`[NDC Clients] Failed to create ${code} client:`, err.message);
    }
  }

  return clients;
};

/**
 * Get all available airline clients
 * @returns {object} Map of airline code to client
 */
export const getAirlineClients = () => {
  if (!clientCache) {
    clientCache = buildClients();
  }
  return clientCache;
};

/**
 * Get list of enabled airline codes
 * @returns {string[]} Array of enabled airline codes
 */
export const getEnabledAirlineCodes = () => {
  return Object.keys(getAirlineClients());
};
