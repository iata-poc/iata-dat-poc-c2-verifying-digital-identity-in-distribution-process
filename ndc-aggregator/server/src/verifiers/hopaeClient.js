import axios from 'axios';

import { config } from '../config.js';

const client = axios.create({
  baseURL: config.hopae.apiUrl,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 15000,
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('[Hopae] Request failed:', {
      url: error.config?.url,
      status: error.response?.status,
      message: error.message,
    });
    return Promise.reject(error);
  }
);

/**
 * Start a QR-based OpenID4VP verification session
 * @returns {Promise<{requestUri: string, sessionId: string}>}
 */
const startQrSession = async () => {
  console.log('[Hopae] Starting QR verification session...');
  const response = await client.post('/openid4vp/qr/start');
  console.log('[Hopae] QR session started, sessionId:', response.data.sessionId);
  return response.data;
};

/**
 * Check the status of a QR verification session
 * @param {string} sessionId - Hopae session ID
 * @returns {Promise<{status: string, verified?: boolean, claims?: object}>}
 */
const getSessionStatus = async (sessionId) => {
  const response = await client.get(`/openid4vp/qr/status/${sessionId}`);
  return response.data;
};

/**
 * Generate a Verifiable Presentation from a VCDM VC
 * Calls Hopae's debug endpoint to wrap a VC into a VP token
 * @param {object} vc - The VCDM Verifiable Credential
 * @param {string} txId - Transaction ID to include in the VP
 * @returns {Promise<object>} VP generation result
 */
const generateVP = async (vc, txId) => {
  console.log('[Hopae] Generating VP from VC, txId:', txId);
  const response = await client.post('/debug/vcdm/vp', {
    vc,
    tx_id: txId,
  });
  console.log('[Hopae] VP generated successfully');
  return response.data;
};

/**
 * Get credential revocation status from a StatusList
 * @param {number|string} listId - Status list ID
 * @returns {Promise<{revoked: number[]}>} Object with array of revoked indices
 */
const getCredentialStatus = async (listId) => {
  console.log(`[Hopae] Fetching credential status for listId=${listId}`);
  const response = await client.get(`/status-list/${listId}/debug`);
  console.log('[Hopae] Credential status:', response.data);
  return response.data;
};

/**
 * Toggle credential status in a StatusList (revoke ↔ enable)
 * @param {number|string} listId - Status list ID
 * @param {number|string} index  - Index within the status list
 * @returns {Promise<object>} HOPAE response
 */
const toggleCredentialStatus = async (listId, index) => {
  console.log(`[Hopae] Toggling credential status: listId=${listId}, index=${index}`);
  const response = await client.put(`/status-list/${listId}/${index}`);
  console.log('[Hopae] Credential status toggled:', response.data);
  return response.data;
};

export const hopaeApi = { startQrSession, getSessionStatus, generateVP, getCredentialStatus, toggleCredentialStatus };
