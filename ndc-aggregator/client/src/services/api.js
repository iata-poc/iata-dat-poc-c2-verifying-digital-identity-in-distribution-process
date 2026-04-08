const API_BASE = '/api';

const VERIFICATION_ID_KEY = 'verificationId';
const AGENCY_TOKEN_KEY = 'agencyToken';

/**
 * Agency login — validates credentials against the backend
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{token: string}>}
 */
export const agencyLogin = async (username, password) => {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.msg || 'Wrong credentials');
  }

  const data = await res.json();
  if (data.token) {
    sessionStorage.setItem(AGENCY_TOKEN_KEY, data.token);
  }
  return data;
};

/**
 * Clear stored agency token (e.g., on logout)
 */
export const clearAgencyToken = () => {
  sessionStorage.removeItem(AGENCY_TOKEN_KEY);
};

/**
 * Get authentication headers for NDC API calls.
 * Agency token (UC1) takes precedence over verification ID (UC2).
 * @returns {object} Headers object with appropriate auth header
 */
const getAuthHeaders = () => {
  const headers = { 'Content-Type': 'application/json' };
  const agencyToken = sessionStorage.getItem(AGENCY_TOKEN_KEY);
  const verificationId = sessionStorage.getItem(VERIFICATION_ID_KEY);

  if (agencyToken) {
    headers['X-Agency-Token'] = agencyToken;
  } else if (verificationId) {
    headers['X-Verification-Id'] = verificationId;
  }
  return headers;
};

/**
 * Get agency-only auth headers (for VC management endpoints)
 * @returns {object} Headers with X-Agency-Token
 */
const getAgencyHeaders = () => {
  const headers = { 'Content-Type': 'application/json' };
  const agencyToken = sessionStorage.getItem(AGENCY_TOKEN_KEY);
  if (agencyToken) {
    headers['X-Agency-Token'] = agencyToken;
  }
  return headers;
};

/**
 * Store the verificationId after successful authentication
 * @param {string} verificationId
 */
export const setVerificationId = (verificationId) => {
  if (verificationId) {
    sessionStorage.setItem(VERIFICATION_ID_KEY, verificationId);
  }
};

/**
 * Clear stored verificationId (e.g., on logout)
 */
export const clearVerificationId = () => {
  sessionStorage.removeItem(VERIFICATION_ID_KEY);
};

/**
 * Search for flights (authenticated)
 * @param {object} params - Search parameters
 * @param {string} params.origin - Origin airport code (e.g., 'DXB')
 * @param {string} params.destination - Destination airport code (e.g., 'YYZ')
 * @param {string} params.departureDate - Departure date (YYYY-MM-DD)
 * @param {string} [params.returnDate] - Return date for round-trip
 * @param {Array}  [params.passengers] - Passenger list [{type: 'ADT', count: 1}]
 * @returns {Promise<object>} { searchId, tripType, flights[], metadata }
 */
export const searchFlights = async (params) => {
  const res = await fetch(`${API_BASE}/shopping/air`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || err.msg || `Search failed (${res.status})`);
  }

  return res.json();
};

/**
 * Reprice a selected offer (authenticated)
 * @param {string} searchId - From search response
 * @param {string} offerId - Selected fare option's offerId
 * @returns {Promise<object>} Reprice result with price comparison
 */
export const repriceOffer = async (searchId, offerId) => {
  const res = await fetch(`${API_BASE}/shopping/offers/${offerId}/reprice`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ searchId, offerId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || err.msg || `Reprice failed (${res.status})`);
  }

  return res.json();
};

/**
 * Start a verification session (generates QR content)
 * @param {string} flowType - Flow type (e.g., 'agency_desktop')
 * @returns {Promise<{id: string, qrContent: string, state: string}>}
 */
export const createVerification = async (flowType = 'agency_desktop') => {
  const res = await fetch(`${API_BASE}/public/verifications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow: flowType }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || err.msg || `Verification request failed (${res.status})`);
  }

  return res.json();
};

/**
 * Check verification status (polls backend)
 * @param {string} verificationId - Verification session ID
 * @returns {Promise<{id: string, state: string}>}
 */
export const checkVerificationStatus = async (verificationId) => {
  const res = await fetch(`${API_BASE}/public/verifications/${verificationId}`, {
    method: 'GET',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || err.msg || `Status check failed (${res.status})`);
  }

  return res.json();
};

/**
 * Create an order from a selected offer (authenticated)
 * @param {string} searchId
 * @param {string} offerId
 * @param {Array} passengers
 * @param {object} payment
 * @returns {Promise<object>} Order result
 */
export const createOrder = async (searchId, offerId, passengers, payment) => {
  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ searchId, offerId, passengers, payment }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || err.msg || `Order creation failed (${res.status})`);
  }

  return res.json();
};

/**
 * Upload an agency VCDM Verifiable Credential
 * @param {object} vc - The VC JSON object
 * @returns {Promise<{message: string, vc: object}>}
 */
export const uploadVC = async (vc) => {
  const res = await fetch(`${API_BASE}/auth/vc`, {
    method: 'POST',
    headers: getAgencyHeaders(),
    body: JSON.stringify(vc),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.msg || `VC upload failed (${res.status})`);
  }

  return res.json();
};

/**
 * Get stored VC status/info
 * @returns {Promise<{hasVC: boolean, vc: object|null}>}
 */
export const getVCStatus = async () => {
  const res = await fetch(`${API_BASE}/auth/vc`, {
    method: 'GET',
    headers: getAgencyHeaders(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.msg || `VC status check failed (${res.status})`);
  }

  return res.json();
};

/**
 * Check if a credential is currently revoked on HOPAE StatusList
 * @param {number} [listId=1] - Status list ID
 * @param {number} [index=5]  - Index within the status list
 * @returns {Promise<{revoked: boolean}>}
 */
export const getCredentialStatus = async (listId = 1, index = 5) => {
  const res = await fetch(`${API_BASE}/credentials/status?listId=${listId}&index=${index}`, {
    method: 'GET',
    headers: getAgencyHeaders(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.msg || `Credential status check failed (${res.status})`);
  }

  return res.json();
};

/**
 * Toggle credential status on HOPAE StatusList (revoke ↔ enable)
 * @param {number} [listId=1] - Status list ID
 * @param {number} [index=5]  - Index within the status list
 * @returns {Promise<{success: boolean, data: object}>}
 */
export const toggleCredentialStatus = async (listId = 1, index = 5) => {
  const res = await fetch(`${API_BASE}/credentials/toggle`, {
    method: 'PUT',
    headers: getAgencyHeaders(),
    body: JSON.stringify({ listId, index }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.msg || `Credential toggle failed (${res.status})`);
  }

  return res.json();
};

export const deleteVC = async () => {
  const res = await fetch(`${API_BASE}/auth/vc`, {
    method: 'DELETE',
    headers: getAgencyHeaders(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.msg || `VC delete failed (${res.status})`);
  }

  return res.json();
};
