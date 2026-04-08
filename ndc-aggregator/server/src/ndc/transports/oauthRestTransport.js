import axios from 'axios';
import { writeDebugXml } from '../debugLogger.js';

/**
 * OAuth2 REST NDC Transport
 * Creates NDC clients that authenticate via OAuth2 client credentials flow.
 * Used for airlines whose NDC APIs require Bearer token authentication.
 *
 * @param {string} airlineCode - IATA airline code
 * @param {object} airlineConfig - Airline configuration from config.js
 * @returns {object} NDC client with airShopping, offerPrice, orderCreate, orderView methods
 */
export const createOAuthRestTransport = (airlineCode, airlineConfig) => {
  // Token cache (per-client instance)
  let cachedToken = null;
  let tokenExpiresAt = null;
  let tokenRefreshPromise = null;

  /**
   * Get OAuth access token using client credentials flow.
   * Implements token caching and automatic refresh.
   */
  const getAccessToken = async () => {
    const now = Date.now();
    if (cachedToken && tokenExpiresAt && tokenExpiresAt > now + 60000) {
      console.log(`[${airlineCode} OAuth] Using cached access token`);
      return cachedToken;
    }

    if (tokenRefreshPromise) {
      console.log(`[${airlineCode} OAuth] Token refresh already in progress, waiting...`);
      return tokenRefreshPromise;
    }

    console.log(`[${airlineCode} OAuth] Fetching new access token...`);
    tokenRefreshPromise = fetchAccessToken();

    try {
      const token = await tokenRefreshPromise;
      return token;
    } finally {
      tokenRefreshPromise = null;
    }
  };

  /**
   * Fetch new access token from OAuth server
   */
  const fetchAccessToken = async () => {
    const { tokenUrl, clientId, clientSecret, scope } = airlineConfig.oauth || {};

    if (!tokenUrl || !clientId || !clientSecret) {
      throw new Error(`[${airlineCode} OAuth] Missing OAuth configuration (tokenUrl, clientId, clientSecret)`);
    }

    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);
      if (scope) {
        params.append('scope', scope);
      }

      console.log(`[${airlineCode} OAuth] Requesting token from configured endpoint`);

      const response = await axios.post(tokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      });

      const { access_token, expires_in, token_type } = response.data;

      if (!access_token) {
        throw new Error(`[${airlineCode} OAuth] No access_token in response`);
      }

      cachedToken = access_token;
      const expiresInMs = (expires_in || 3600) * 1000;
      tokenExpiresAt = Date.now() + expiresInMs;

      console.log(`[${airlineCode} OAuth] Token acquired successfully:`, {
        tokenType: token_type,
        expiresIn: expires_in,
        expiresAt: new Date(tokenExpiresAt).toISOString(),
      });

      return access_token;
    } catch (error) {
      console.error(`[${airlineCode} OAuth] Failed to fetch access token:`, {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      cachedToken = null;
      tokenExpiresAt = null;

      throw new Error(`${airlineCode} OAuth failed: ${error.message}`);
    }
  };

  // Create dedicated axios instance for this airline's NDC API
  const client = axios.create({
    baseURL: airlineConfig.ndcEndpoint,
    timeout: airlineConfig.timeout || 30000,
    headers: {
      'Content-Type': 'application/xml',
      'Accept': 'application/xml',
    },
  });

  // Request interceptor for OAuth authentication
  client.interceptors.request.use(
    async (request) => {
      try {
        const accessToken = await getAccessToken();
        request.headers['Authorization'] = `Bearer ${accessToken}`;
      } catch (error) {
        console.error(`[${airlineCode} NDC] Failed to get access token:`, error.message);
        return Promise.reject(error);
      }

      console.log(`[${airlineCode} NDC] Request to ${request.url}:`, {
        method: request.method,
        hasAuth: !!request.headers['Authorization'],
        dataLength: request.data?.length || 0,
      });

      return request;
    },
    (error) => {
      console.error(`[${airlineCode} NDC] Request interceptor error:`, error);
      return Promise.reject(error);
    }
  );

  // Response interceptor for logging, retry logic, and token refresh
  client.interceptors.response.use(
    (response) => {
      console.log(`[${airlineCode} NDC] Response from ${response.config.url}:`, {
        status: response.status,
        headers: response.headers,
        dataLength: response.data?.length || 0,
      });
      return response;
    },
    async (error) => {
      const originalRequest = error.config;

      console.error(`[${airlineCode} NDC] Response error:`, {
        url: originalRequest?.url,
        status: error.response?.status,
        headers: error.response?.headers,
        message: error.message,
      });

      if (!originalRequest) {
        console.error(`[${airlineCode} NDC] Error has no config, cannot retry`);
        return Promise.reject(error);
      }

      // Handle 401 Unauthorized - refresh token and retry once
      if (error.response?.status === 401 && !originalRequest._tokenRetried) {
        console.log(`[${airlineCode} NDC] 401 Unauthorized - refreshing token and retrying...`);

        cachedToken = null;
        tokenExpiresAt = null;
        originalRequest._tokenRetried = true;

        try {
          const newToken = await getAccessToken();
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
          return client(originalRequest);
        } catch (tokenError) {
          console.error(`[${airlineCode} NDC] Token refresh failed:`, tokenError.message);
          return Promise.reject(tokenError);
        }
      }

      // Retry logic with exponential backoff
      if (!originalRequest._retryCount) {
        originalRequest._retryCount = 0;
      }

      const maxRetries = airlineConfig.retries || 3;
      const shouldRetry =
        originalRequest._retryCount < maxRetries &&
        (error.code === 'ECONNRESET' ||
          error.code === 'ETIMEDOUT' ||
          (error.response?.status >= 500 && error.response?.status !== 503));

      if (shouldRetry) {
        originalRequest._retryCount++;
        const delay = Math.pow(2, originalRequest._retryCount) * 1000;

        console.log(
          `[${airlineCode} NDC] Retrying request (${originalRequest._retryCount}/${maxRetries}) after ${delay}ms`
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        return client(originalRequest);
      }

      return Promise.reject(error);
    }
  );

  // Get endpoints from config
  const endpoints = airlineConfig.endpoints || {
    airShopping: '/AirShopping',
    offerPrice: '/OfferPrice',
    orderCreate: '/OrderCreate',
    orderRetrieve: '/OrderRetrieve',
  };

  // Return the NDC client API
  return {
    airShopping: async (requestXml) => {
      try {
        writeDebugXml(airlineCode, 'AirShopping', 'request', requestXml);
        const response = await client.post(endpoints.airShopping, requestXml);
        writeDebugXml(airlineCode, 'AirShopping', 'response', typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2));
        return response;
      } catch (error) {
        console.error(`[${airlineCode} NDC] AirShopping error:`, error.message);
        throw error;
      }
    },

    offerPrice: async (requestXml) => {
      try {
        writeDebugXml(airlineCode, 'OfferPrice', 'request', requestXml);
        const response = await client.post(endpoints.offerPrice, requestXml);
        writeDebugXml(airlineCode, 'OfferPrice', 'response', typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2));
        return response;
      } catch (error) {
        console.error(`[${airlineCode} NDC] OfferPrice error:`, error.message);
        if (error.response?.data) {
          writeDebugXml(airlineCode, 'OfferPrice', 'error-response', typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data, null, 2));
        }
        throw error;
      }
    },

    orderCreate: async (requestXml) => {
      try {
        writeDebugXml(airlineCode, 'OrderCreate', 'request', requestXml);
        const response = await client.post(endpoints.orderCreate, requestXml);
        writeDebugXml(airlineCode, 'OrderCreate', 'response', typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2));
        return response;
      } catch (error) {
        console.error(`[${airlineCode} NDC] OrderCreate error:`, error.message);
        throw error;
      }
    },

    orderView: async (orderId, requestXml) => {
      try {
        writeDebugXml(airlineCode, 'OrderView', 'request', requestXml);
        const response = await client.post(endpoints.orderRetrieve, requestXml);
        writeDebugXml(airlineCode, 'OrderView', 'response', typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2));
        return response;
      } catch (error) {
        console.error(`[${airlineCode} NDC] OrderView error:`, error.message);
        throw error;
      }
    },

    airlineCode,
  };
};
