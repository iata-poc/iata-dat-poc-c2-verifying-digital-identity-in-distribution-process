import { randomUUID } from 'crypto';

import { AppError } from '../appError.js';

/**
 * Search Context Schema:
 * {
 *   searchId: uuid,
 *   verificationId: string,
 *   agentDid: string,              // Agent DID for ownership validation
 *   agencyId: string,              // Agency ID for ownership validation
 *   createdAt: Date,
 *   expiresAt: Date,
 *   searchParams: {
 *     origin: string,
 *     destination: string,
 *     departureDate: string,
 *     passengers: array,
 *     cabinClass: string,
 *     currency: string,
 *     ...
 *   },
 *   offers: [
 *     {
 *       offerId: string,
 *       airlineCode: string,
 *       price: object,
 *       segments: array,
 *       fareDetails: object,
 *       ndcReferences: object,
 *     }
 *   ],
 *   ndcRefs: {
 *     shoppingResponseId: string,
 *     offersMap: {
 *       [offerId]: {
 *         airlineCode: string,
 *         ndcOfferId: string,
 *         offerItemIds: array,
 *         flightKeys: array,
 *         priceClassId: string,
 *       }
 *     }
 *   },
 *   vpData: {
 *     vpToken: string,
 *     agentProfile: object,
 *   }
 * }
 */

// In-memory store for search contexts
const searchContexts = [];

// Default expiration: 30 minutes
const DEFAULT_EXPIRATION_MS = 30 * 60 * 1000;

/**
 * Add a new search context
 * @param {object} context - Search context data
 * @returns {string} searchId
 */
const addSearchContext = (context) => {
  const searchId = context.searchId || randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEFAULT_EXPIRATION_MS);

  // Extract agent identity for ownership validation
  const agentDid = context.vpData?.agentProfile?.did || null;
  const agencyId = context.vpData?.agentProfile?.agency?.id || null;

  const searchContext = {
    searchId,
    createdAt: now,
    expiresAt,
    agentDid,
    agencyId,
    ...context,
  };

  searchContexts.push(searchContext);
  
  // Cleanup expired contexts
  cleanupExpired();

  console.log(`[SearchContextStore] Created context ${searchId} for agent ${agentDid || 'unknown'}`);

  return searchId;
};

/**
 * Get search context by ID
 * @param {string} searchId - Search ID
 * @returns {object|undefined} Search context (immutable copy)
 */
const getSearchContext = (searchId) => {
  const context = searchContexts.find((c) => c.searchId === searchId);
  
  if (!context) {
    return undefined;
  }

  // Check if expired
  if (context.expiresAt < new Date()) {
    return undefined;
  }

  // Return immutable copy
  return { ...context };
};

/**
 * Update search context
 * @param {string} searchId - Search ID
 * @param {object} updates - Updates to apply
 * @returns {boolean} Success
 */
const updateSearchContext = (searchId, updates) => {
  const index = searchContexts.findIndex((c) => c.searchId === searchId);
  
  if (index === -1) {
    return false;
  }

  searchContexts[index] = {
    ...searchContexts[index],
    ...updates,
  };

  return true;
};

/**
 * Get offer from search context
 * @param {string} searchId - Search ID
 * @param {string} offerId - Offer ID
 * @returns {object|undefined} Offer with NDC references
 */
const getOfferFromContext = (searchId, offerId) => {
  const context = getSearchContext(searchId);
  
  if (!context) {
    return undefined;
  }

  const offer = context.offers?.find((o) => o.offerId === offerId);
  
  if (!offer) {
    return undefined;
  }

  // Return offer with context data
  return {
    ...offer,
    searchId,
    searchParams: context.searchParams,
    vpData: context.vpData,
  };
};

/**
 * Delete search context
 * @param {string} searchId - Search ID
 * @returns {boolean} Success
 */
const deleteSearchContext = (searchId) => {
  const index = searchContexts.findIndex((c) => c.searchId === searchId);
  
  if (index === -1) {
    return false;
  }

  searchContexts.splice(index, 1);
  return true;
};

/**
 * Cleanup expired search contexts
 */
const cleanupExpired = () => {
  const now = new Date();
  const validContexts = searchContexts.filter((c) => c.expiresAt > now);
  
  const removedCount = searchContexts.length - validContexts.length;
  if (removedCount > 0) {
    searchContexts.length = 0;
    searchContexts.push(...validContexts);
    console.log(`[SearchContextStore] Cleaned up ${removedCount} expired contexts`);
  }
};

/**
 * Get all search contexts (for debugging)
 * @returns {array} All contexts
 */
const getAllSearchContexts = () => {
  return searchContexts.map((c) => ({ ...c }));
};

/**
 * Validate that the requesting agent owns the search context
 * @param {string} searchId - Search ID
 * @param {object} agentProfile - Agent profile from request
 * @returns {object} Search context if valid
 * @throws {AppError} If context not found or ownership mismatch
 */
const validateContextOwnership = (searchId, agentProfile) => {
  const context = getSearchContext(searchId);
  
  if (!context) {
    throw new AppError({
      statusCode: 404,
      msg: 'Search context not found or expired',
    });
  }

  // If context has no agent binding (legacy or test), allow access
  if (!context.agentDid) {
    console.warn(`[SearchContextStore] Context ${searchId} has no agent binding - allowing access`);
    return context;
  }

  // Validate agent DID matches
  const requestingAgentDid = agentProfile?.did;
  
  if (!requestingAgentDid) {
    throw new AppError({
      statusCode: 401,
      msg: 'Agent identity required to access search context',
    });
  }

  if (context.agentDid !== requestingAgentDid) {
    console.error(`[SearchContextStore] Ownership mismatch: context belongs to ${context.agentDid}, requested by ${requestingAgentDid}`);
    throw new AppError({
      statusCode: 403,
      msg: 'You do not have permission to access this search context',
    });
  }

  return context;
};

/**
 * Get offer from search context with ownership validation
 * @param {string} searchId - Search ID
 * @param {string} offerId - Offer ID
 * @param {object} agentProfile - Agent profile for ownership validation
 * @returns {object|undefined} Offer with NDC references
 * @throws {AppError} If context not found, ownership mismatch, or offer not found
 */
const getOfferWithOwnershipValidation = (searchId, offerId, agentProfile) => {
  const context = validateContextOwnership(searchId, agentProfile);

  const offer = context.offers?.find((o) => o.offerId === offerId);
  
  if (!offer) {
    throw new AppError({
      statusCode: 404,
      msg: `Offer ${offerId} not found in search context`,
    });
  }

  return {
    ...offer,
    searchId,
    searchParams: context.searchParams,
    vpData: context.vpData,
  };
};

export const searchContextStore = {
  addSearchContext,
  getSearchContext,
  updateSearchContext,
  getOfferFromContext,
  deleteSearchContext,
  cleanupExpired,
  getAllSearchContexts,
  validateContextOwnership,
  getOfferWithOwnershipValidation,
};
