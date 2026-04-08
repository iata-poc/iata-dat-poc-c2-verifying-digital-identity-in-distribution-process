import axios from 'axios';
import { writeDebugXml } from '../debugLogger.js';

/**
 * SOAP + Subscription Key NDC Transport
 * Creates NDC clients that use SOAP envelope wrapping with subscription key header.
 * No HTTP-level authentication — auth is via VP token in DistributionChain.
 *
 * @param {string} airlineCode - IATA airline code
 * @param {object} airlineConfig - Airline configuration from config.js
 * @returns {object} NDC client with airShopping, offerPrice, orderCreate, orderView methods
 */
export const createSoapSubscriptionTransport = (airlineCode, airlineConfig) => {
  // Axios instance — SOAP with subscription key header
  const headers = {
    'Content-Type': 'text/xml; charset=utf-8',
    'Accept': 'text/xml, application/xml',
  };
  if (airlineConfig.subscriptionKey) {
    headers['Ocp-Apim-Subscription-Key'] = airlineConfig.subscriptionKey;
  }
  const client = axios.create({
    baseURL: airlineConfig.ndcEndpoint,
    timeout: airlineConfig.timeout || 30000,
    headers,
  });

  // Request interceptor for logging
  client.interceptors.request.use(
    (request) => {
      console.log(`[${airlineCode} SOAP] Request to ${request.url}:`, {
        method: request.method,
        dataLength: request.data?.length || 0,
      });
      return request;
    },
    (error) => {
      console.error(`[${airlineCode} SOAP] Request error:`, error.message);
      return Promise.reject(error);
    }
  );

  // Response interceptor with retry logic
  client.interceptors.response.use(
    (response) => {
      console.log(`[${airlineCode} SOAP] Response from ${response.config.url}:`, {
        status: response.status,
        dataLength: response.data?.length || 0,
      });
      return response;
    },
    async (error) => {
      const originalRequest = error.config;
      console.error(`[${airlineCode} SOAP] Response error:`, {
        url: originalRequest?.url,
        status: error.response?.status,
        message: error.message,
        responseSnippet: typeof error.response?.data === 'string' ? error.response.data.substring(0, 500) : undefined,
      });

      if (!originalRequest) return Promise.reject(error);

      // Exponential backoff retry
      if (!originalRequest._retryCount) originalRequest._retryCount = 0;
      const maxRetries = airlineConfig.retries || 3;
      const shouldRetry =
        originalRequest._retryCount < maxRetries &&
        (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' ||
          (error.response?.status >= 500 && error.response?.status !== 503));

      if (shouldRetry) {
        originalRequest._retryCount++;
        const delay = Math.pow(2, originalRequest._retryCount) * 1000;
        console.log(`[${airlineCode} SOAP] Retrying (${originalRequest._retryCount}/${maxRetries}) after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return client(originalRequest);
      }

      return Promise.reject(error);
    }
  );

  /**
   * Wrap NDC XML inside a SOAP envelope (empty header)
   */
  const wrapInSoapEnvelope = (ndcXml) => {
    const body = ndcXml.replace(/<\?xml[^?]*\?>\s*/i, '');

    return [
      '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
      '  <soap:Header/>',
      '  <soap:Body>',
      `    ${body}`,
      '  </soap:Body>',
      '</soap:Envelope>',
    ].join('\n');
  };

  /**
   * Unwrap SOAP response to get the inner NDC XML body
   */
  const unwrapSoapResponse = (soapXml) => {
    if (!soapXml || typeof soapXml !== 'string') return soapXml;

    const bodyMatch = soapXml.match(
      /<(?:soap|soapenv|S|SOAP-ENV):Body[^>]*>([\s\S]*?)<\/(?:soap|soapenv|S|SOAP-ENV):Body>/i
    );
    if (bodyMatch && bodyMatch[1]) {
      return bodyMatch[1].trim();
    }

    return soapXml;
  };

  /**
   * Send SOAP-wrapped NDC request and unwrap response
   */
  const sendRequest = async (endpoint, requestXml) => {
    const soapPayload = wrapInSoapEnvelope(requestXml);
    writeDebugXml(airlineCode, 'SOAP-Envelope', 'request', soapPayload);

    const response = await client.post(endpoint || '', soapPayload);

    // Unwrap SOAP response for parser compatibility
    if (typeof response.data === 'string') {
      response.data = unwrapSoapResponse(response.data);
    }

    return response;
  };

  const endpoints = airlineConfig.endpoints || {};

  return {
    airShopping: async (requestXml) => {
      try {
        writeDebugXml(airlineCode, 'AirShopping', 'request', requestXml);
        const response = await sendRequest(endpoints.airShopping, requestXml);
        writeDebugXml(airlineCode, 'AirShopping', 'response', typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2));
        return response;
      } catch (error) {
        console.error(`[${airlineCode} SOAP] AirShopping error:`, error.message);
        throw error;
      }
    },

    offerPrice: async (requestXml) => {
      try {
        writeDebugXml(airlineCode, 'OfferPrice', 'request', requestXml);
        const response = await sendRequest(endpoints.offerPrice, requestXml);
        writeDebugXml(airlineCode, 'OfferPrice', 'response', typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2));
        return response;
      } catch (error) {
        console.error(`[${airlineCode} SOAP] OfferPrice error:`, error.message);
        throw error;
      }
    },

    orderCreate: async (requestXml) => {
      try {
        writeDebugXml(airlineCode, 'OrderCreate', 'request', requestXml);
        const response = await sendRequest(endpoints.orderCreate, requestXml);
        writeDebugXml(airlineCode, 'OrderCreate', 'response', typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2));
        return response;
      } catch (error) {
        console.error(`[${airlineCode} SOAP] OrderCreate error:`, error.message);
        throw error;
      }
    },

    orderView: async (orderId, requestXml) => {
      try {
        writeDebugXml(airlineCode, 'OrderView', 'request', requestXml);
        const response = await sendRequest(endpoints.orderRetrieve, requestXml);
        writeDebugXml(airlineCode, 'OrderView', 'response', typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2));
        return response;
      } catch (error) {
        console.error(`[${airlineCode} SOAP] OrderView error:`, error.message);
        throw error;
      }
    },

    airlineCode,
  };
};
