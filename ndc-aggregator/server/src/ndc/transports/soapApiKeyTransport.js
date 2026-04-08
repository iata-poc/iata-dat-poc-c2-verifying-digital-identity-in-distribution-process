import axios from 'axios';
import { writeDebugXml } from '../debugLogger.js';

/**
 * SOAP + API Key NDC Transport
 * Creates NDC clients that use SOAP envelope wrapping and API key header authentication.
 *
 * @param {string} airlineCode - IATA airline code
 * @param {object} airlineConfig - Airline configuration from config.js
 * @returns {object} NDC client with airShopping, offerPrice, orderCreate, orderView methods
 */
export const createSoapApiKeyTransport = (airlineCode, airlineConfig) => {
  const { apiKey, apiKeyHeader = 'x-api-key', useSoapEnvelope = true, soapConfig = {} } = airlineConfig;

  if (!apiKey) {
    console.warn(`[${airlineCode} SOAP] No API key configured — requests will fail`);
  }

  // Create dedicated axios instance
  const client = axios.create({
    baseURL: airlineConfig.ndcEndpoint,
    timeout: airlineConfig.timeout || 30000,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Accept': 'text/xml, application/xml',
      ...(apiKey ? { [apiKeyHeader]: apiKey } : {}),
    },
  });

  // Request interceptor for logging
  client.interceptors.request.use(
    (request) => {
      console.log(`[${airlineCode} SOAP] Request to ${request.url}:`, {
        method: request.method,
        hasApiKey: !!request.headers[apiKeyHeader],
        dataLength: request.data?.length || 0,
      });
      return request;
    },
    (error) => {
      console.error(`[${airlineCode} SOAP] Request interceptor error:`, error);
      return Promise.reject(error);
    }
  );

  // Response interceptor for logging and retry logic
  client.interceptors.response.use(
    (response) => {
      console.log(`[${airlineCode} SOAP] Response from ${response.config.url}:`, {
        status: response.status,
        headers: response.headers,
        dataLength: response.data?.length || 0,
      });
      return response;
    },
    async (error) => {
      const originalRequest = error.config;

      console.error(`[${airlineCode} SOAP] Response error:`, {
        url: originalRequest?.url,
        status: error.response?.status,
        headers: error.response?.headers,
        message: error.message,
        code: error.code,
        responseSnippet: typeof error.response?.data === 'string' ? error.response.data.substring(0, 500) : undefined,
      });

      if (!originalRequest) {
        return Promise.reject(error);
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
          `[${airlineCode} SOAP] Retrying request (${originalRequest._retryCount}/${maxRetries}) after ${delay}ms`
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        return client(originalRequest);
      }

      return Promise.reject(error);
    }
  );

  /**
   * Wrap NDC XML payload inside a SOAP envelope
   */
  const wrapInSoapEnvelope = (ndcXml, cfg = {}) => {
    const body = ndcXml.replace(/<\?xml[^?]*\?>\s*/i, '');
    const envelopeAttrs = cfg.envelopeAttrs || '';
    const headerContent = cfg.headerXml || '';

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"${envelopeAttrs ? ' ' + envelopeAttrs : ''}>`,
      `  <soapenv:Header>${headerContent ? '\n    ' + headerContent + '\n  ' : ''}</soapenv:Header>`,
      '  <soapenv:Body>',
      `    ${body}`,
      '  </soapenv:Body>',
      '</soapenv:Envelope>',
    ].join('\n');
  };

  /**
   * Wrap NDC XML inside NDCMSG_Envelope (CDATA-wrapped inner payload)
   */
  const wrapInNdcMsgEnvelope = (ndcXml, ndcMsgConfig = {}) => {
    const body = ndcXml.replace(/<\?xml[^?]*\?>\s*/i, '');
    const sellerId = ndcMsgConfig.sellerId || '';
    const company = ndcMsgConfig.company || airlineCode;
    const nsUri = ndcMsgConfig.namespaceUri || '';
    const nsPrefix = ndcMsgConfig.nsPrefix || 'ns';
    const schemaType = ndcMsgConfig.schemaType || 'NDC';
    const schemaVersion = ndcMsgConfig.schemaVersion || '';

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:${nsPrefix}="${nsUri}">`,
      '  <soapenv:Header/>',
      '  <soapenv:Body>',
      `    <${nsPrefix}:NDCMSG_Envelope>`,
      '      <NDCMSG_Header>',
      '        <Sender>',
      `          <SellerID>${sellerId}</SellerID>`,
      '        </Sender>',
      '        <Recipient>',
      '          <Address>',
      `            <Company>${company}</Company>`,
      '          </Address>',
      '        </Recipient>',
      `        <SchemaType>${schemaType}</SchemaType>`,
      `        <SchemaVersion>${schemaVersion}</SchemaVersion>`,
      '      </NDCMSG_Header>',
      '      <NDCMSG_Body>',
      `        <NDCMSG_Payload><![CDATA[${body}]]></NDCMSG_Payload>`,
      '      </NDCMSG_Body>',
      `    </${nsPrefix}:NDCMSG_Envelope>`,
      '  </soapenv:Body>',
      '</soapenv:Envelope>',
    ].join('\n');
  };

  /**
   * Unwrap SOAP response to get the inner NDC XML body
   */
  const unwrapSoapResponse = (soapXml) => {
    if (!soapXml || typeof soapXml !== 'string') return soapXml;

    const bodyMatch = soapXml.match(/<(?:soap|soapenv|S|SOAP-ENV):Body[^>]*>([\s\S]*?)<\/(?:soap|soapenv|S|SOAP-ENV):Body>/i);
    if (!bodyMatch || !bodyMatch[1]) {
      return soapXml;
    }

    let inner = bodyMatch[1].trim();

    // Handle NDCMSG_Envelope responses: extract CDATA content from NDCMSG_Payload
    const cdataMatch = inner.match(/NDCMSG_Payload[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/(?:\w+:)?NDCMSG_Payload>/i);
    if (cdataMatch && cdataMatch[1]) {
      return cdataMatch[1].trim();
    }

    // Handle NDCMSG_Payload without CDATA (plain content)
    const payloadMatch = inner.match(/<(?:\w+:)?NDCMSG_Payload[^>]*>([\s\S]*?)<\/(?:\w+:)?NDCMSG_Payload>/i);
    if (payloadMatch && payloadMatch[1]) {
      return payloadMatch[1].trim();
    }

    return inner;
  };

  /**
   * Send an NDC request, wrapping in SOAP and unwrapping the response
   * @param {string} endpoint - API endpoint path
   * @param {string} requestXml - Raw NDC XML
   * @param {string} [wrapMode='soap'] - 'soap' (standard) or 'ndcmsg' (NDCMSG_Envelope with CDATA)
   * @param {string} [soapAction] - Optional SOAPAction header value
   */
  const sendRequest = async (endpoint, requestXml, wrapMode = 'soap', soapAction = null) => {
    let payload;
    if (useSoapEnvelope && wrapMode === 'ndcmsg' && soapConfig.ndcMsgEnvelope) {
      payload = wrapInNdcMsgEnvelope(requestXml, soapConfig.ndcMsgEnvelope);
    } else if (useSoapEnvelope) {
      payload = wrapInSoapEnvelope(requestXml, soapConfig);
    } else {
      payload = requestXml;
    }

    if (useSoapEnvelope) {
      const operation = endpoint.split('/').pop() || 'Unknown';
      writeDebugXml(airlineCode, operation, 'request-SOAP', payload);
    }

    const requestHeaders = {};
    if (soapAction) {
      requestHeaders['SOAPAction'] = `"${soapAction}"`;
    }

    const response = await client.post(endpoint, payload, {
      headers: Object.keys(requestHeaders).length > 0 ? requestHeaders : undefined,
    });

    // Unwrap SOAP response so parsers receive plain NDC XML
    if (useSoapEnvelope && typeof response.data === 'string') {
      response.data = unwrapSoapResponse(response.data);
    }

    return response;
  };

  // Get endpoints from config
  const endpoints = airlineConfig.endpoints || {
    airShopping: '/AirShopping',
    offerPrice: '/OfferPrice',
    orderCreate: '/OrderCreate',
    orderRetrieve: '/OrderRetrieve',
  };

  // Optional SOAPAction headers per operation
  const soapActions = airlineConfig.soapActions || {};

  // Return the NDC client API (same interface as OAuth transport)
  return {
    airShopping: async (requestXml) => {
      try {
        writeDebugXml(airlineCode, 'AirShopping', 'request', requestXml);
        const response = await sendRequest(endpoints.airShopping, requestXml, 'soap', soapActions.airShopping || null);
        writeDebugXml(airlineCode, 'AirShopping', 'response', typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2));
        return response;
      } catch (error) {
        console.error(`[${airlineCode} SOAP] AirShopping error:`, { message: error.message, status: error.response?.status, code: error.code });
        throw error;
      }
    },

    offerPrice: async (requestXml) => {
      try {
        writeDebugXml(airlineCode, 'OfferPrice', 'request', requestXml);
        const response = await sendRequest(endpoints.offerPrice, requestXml, 'soap', soapActions.offerPrice || null);
        writeDebugXml(airlineCode, 'OfferPrice', 'response', typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2));
        return response;
      } catch (error) {
        console.error(`[${airlineCode} SOAP] OfferPrice error:`, { message: error.message, status: error.response?.status, code: error.code });
        throw error;
      }
    },

    orderCreate: async (requestXml) => {
      try {
        writeDebugXml(airlineCode, 'OrderCreate', 'request', requestXml);
        const wrapMode = soapConfig.ndcMsgEnvelope ? 'ndcmsg' : 'soap';
        const response = await sendRequest(endpoints.orderCreate, requestXml, wrapMode, soapActions.orderCreate || null);
        writeDebugXml(airlineCode, 'OrderCreate', 'response', typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2));
        return response;
      } catch (error) {
        console.error(`[${airlineCode} SOAP] OrderCreate error:`, { message: error.message, status: error.response?.status, code: error.code });
        throw error;
      }
    },

    orderView: async (orderId, requestXml) => {
      try {
        writeDebugXml(airlineCode, 'OrderView', 'request', requestXml);
        const response = await sendRequest(endpoints.orderRetrieve, requestXml, 'soap', soapActions.orderRetrieve || null);
        writeDebugXml(airlineCode, 'OrderView', 'response', typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2));
        return response;
      } catch (error) {
        console.error(`[${airlineCode} SOAP] OrderView error:`, { message: error.message, status: error.response?.status, code: error.code });
        throw error;
      }
    },

    airlineCode,
  };
};
