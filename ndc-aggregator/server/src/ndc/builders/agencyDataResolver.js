import { config } from '../../config.js';

/**
 * Unified agency data resolver for NDC request builders.
 *
 * Resolution cascade (first non-empty value wins):
 *   1. Agent profile (from Hopae claims or direct VP token)
 *   2. Airline-specific config (from env vars)
 *   3. Hardcoded defaults
 *
 * @param {object} vpData - VP data with agentProfile and vpToken
 * @param {string} airlineCode - IATA airline code
 * @returns {object} Resolved agency data
 */
export const resolveAgencyData = (vpData, airlineCode) => {
  const profile = vpData?.agentProfile || {};
  const agency = profile.agency || {};
  const airlineConfig = config.airlines[airlineCode.toLowerCase()] || {};

  return {
    agencyName:   agency.name       || airlineConfig.agencyName   || '',
    iataNumber:   airlineConfig.iataNumber || agency.iataNumber   || '',
    agencyId:     airlineConfig.agencyId   || agency.id           || '',
    did:          profile.did       || '',
    agentName:    profile.name      || '',
    vpToken:      vpData?.vpToken   || null,

    // Extended profile fields (config-only, no VP equivalent)
    aggregatorName:  airlineConfig.aggregatorName  || '',
    aggregatorId:    airlineConfig.aggregatorId    || '',
    contactEmail:    airlineConfig.contactEmail    || '',
    contactCountry:  airlineConfig.contactCountry  || '',
  };
};
