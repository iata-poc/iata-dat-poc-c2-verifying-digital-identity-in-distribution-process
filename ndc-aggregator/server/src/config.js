import 'dotenv/config';

const env = { ...process.env };

const splitVariable = (variable) => {
  if (!variable) {
    return [];
  }

  return variable.split(',');
};

export const config = {
  env: env.NODE_ENV,
  web: {
    httpPort: env.WEB_PORT ?? 3000,
    allowedOrigins: env.WEB_ALLOWED_ORIGINS ?? '',
    hostUrl: env.WEB_HOST_URL,
  },
  clients: splitVariable(env.WEB_ALLOWED_CLIENT_IDS),
  hopae: {
    apiUrl: env.HOPAE_API_URL,
  },
  agencyLogin: {
    username: env.AGENCY_USERNAME,
    password: env.AGENCY_PASSWORD,
  },
  demoMode: env.DEMO_MODE === 'true',  // DEMO_MODE=true → reprice & order return mock success; search stays real
  poc: {
    enabled: env.POC_MODE !== 'false',                                        // default true; set POC_MODE=false to disable all PoC filters
    maxStopsPerDirection: isNaN(parseInt(env.POC_MAX_STOPS, 10)) ? 1 : parseInt(env.POC_MAX_STOPS, 10),  // default 1 (allow 1 connection); 0 = direct only
    maxOffers: isNaN(parseInt(env.POC_MAX_OFFERS, 10)) ? 0 : parseInt(env.POC_MAX_OFFERS, 10),  // default 0 (no limit); best-per-airline filter handles search screen cards
  },
  airlines: {
    tk: {
      enabled: env.AIRLINE_TK_ENABLED === 'true',
      code: 'TK',
      ndcVersion: '21.36',
      transport: 'oauth-rest',
      ndcEndpoint: env.TK_NDC_ENDPOINT,
      endpoints: {
        airShopping: env.TK_EP_AIRSHOPPING,
        offerPrice: env.TK_EP_OFFERPRICE,
        orderCreate: env.TK_EP_ORDERCREATE,
        orderRetrieve: env.TK_EP_ORDERRETRIEVE,
      },
      oauth: {
        tokenUrl: env.TK_OAUTH_TOKEN_URL,
        clientId: env.TK_CLIENT_ID,
        clientSecret: env.TK_CLIENT_SECRET,
        scope: env.TK_OAUTH_SCOPE,
      },
      // VP injection: DistributionChain with text VP token
      vpInjection: 'distributionChain',
      distributionChain: {
        links: ['seller', 'carrier'],
        vpFormat: 'text',
        sellerIncludeName: true,
        sellerIncludeSalesBranch: true,
      },
      // Builder profile
      builderProfile: {
        rootElement: 'n1:IATA_AirShoppingRQ',
        versionNumber: '21.36',
        paxIdFormat: 'numeric',          // "1", "2"
        orderPaxIdFormat: 'PAX_numeric',  // "PAX_1", "PAX_2"
        includePayloadAttributes: true,
        includeTrxId: true,
        includeCorrelationId: true,
        includePrimaryLangID: true,
        cabinTypeCodes: ['2', '3'],
        includeOriginDestId: true,
        includeCurParameter: true,
      },
      agencyName: env.TK_AGENCY_NAME,
      iataNumber: env.TK_IATA_NUMBER,
      agencyId: env.TK_AGENCY_ID,
      timeout: parseInt(env.TK_TIMEOUT, 10) || 30000,
      retries: parseInt(env.TK_RETRIES, 10) || 3,
    },
    ba: {
      enabled: env.AIRLINE_BA_ENABLED === 'true',
      code: 'BA',
      ndcVersion: '17.2',
      transport: 'soap-apikey',
      ndcEndpoint: env.BA_NDC_ENDPOINT,
      endpoints: {
        airShopping: env.BA_EP_AIRSHOPPING,
        offerPrice: env.BA_EP_OFFERPRICE,
        orderCreate: env.BA_EP_ORDERCREATE,
        orderRetrieve: env.BA_EP_ORDERRETRIEVE,
      },
      authType: 'apiKey',
      apiKey: env.BA_API_KEY,
      apiKeyHeader: env.BA_API_KEY_HEADER,
      useSoapEnvelope: true,
      soapConfig: {
        envelopeAttrs: env.BA_SOAP_ENVELOPE_ATTRS,
      },
      soapActions: {
        airShopping: env.BA_SA_AIRSHOPPING,
        offerPrice: env.BA_SA_OFFERPRICE,
        orderCreate: env.BA_SA_ORDERCREATE,
      },
      // VP injection: AugmentationPoint
      vpInjection: 'augmentationPoint',
      // Builder profile
      builderProfile: {
        rootElement: 'AirShoppingRQ',
        versionAttr: '17.2',
        defaultXmlns: 'http://www.iata.org/IATA/EDIST/2017.2',
        paxIdFormat: 'T_numeric',         // "T1", "T2"
        documentName: 'BA',
        includePreference: true,
        includeParticipants: true,
        includeContacts: true,
        calendarDaysBefore: '1',
        calendarDaysAfter: '1',
        includeDataListsInOfferPrice: true,
        orderValidation: 'relaxed',
        titleFormat: 'upper',
        contactType: 'Payment',
      },
      agencyName: env.BA_AGENCY_NAME,
      iataNumber: env.BA_IATA_NUMBER,
      agencyId: env.BA_AGENCY_ID,
      aggregatorName: env.BA_AGGREGATOR_NAME,
      aggregatorId: env.BA_AGGREGATOR_ID,
      contactEmail: env.BA_CONTACT_EMAIL,
      contactCountry: env.BA_CONTACT_COUNTRY,
      contactStreet1: env.BA_CONTACT_STREET1,
      contactStreet2: env.BA_CONTACT_STREET2,
      contactCity: env.BA_CONTACT_CITY,
      contactState: env.BA_CONTACT_STATE,
      contactPostalCode: env.BA_CONTACT_POSTAL,
      customVpToken: env.BA_CUSTOM_VP_TOKEN,
      timeout: parseInt(env.BA_TIMEOUT, 10) || 30000,
      retries: parseInt(env.BA_RETRIES, 10) || 3,
    },
    qr: {
      enabled: env.AIRLINE_QR_ENABLED === 'true',
      code: 'QR',
      ndcVersion: '21.3',
      transport: 'soap-subscription',
      ndcEndpoint: env.QR_NDC_ENDPOINT,
      endpoints: {
        airShopping: env.QR_EP_AIRSHOPPING,
        offerPrice: env.QR_EP_OFFERPRICE,
        orderCreate: env.QR_EP_ORDERCREATE,
        orderRetrieve: env.QR_EP_ORDERRETRIEVE,
      },
      subscriptionKey: env.QR_SUBSCRIPTION_KEY,
      // VP injection: DistributionChain with structured VP (VP_Token + Issuer_DID)
      vpInjection: 'distributionChain',
      distributionChain: {
        links: ['seller', 'distributor', 'carrier'],
        vpFormat: 'structured',
        sellerIncludeName: false,
        sellerIncludeSalesBranch: false,
      },
      // Builder profile
      builderProfile: {
        rootElement: 'n1:IATA_AirShoppingRQ',
        versionNumber: '21.3',
        paxIdFormat: 'PAX_numeric',        // "PAX1", "PAX2"
        orderPaxIdFormat: 'PAX_numeric',   // "PAX1", "PAX2"
        includePayloadAttributes: false,
        includePOS: true,
        includeCarrierCriteria: true,
        includeSchemaLocation: true,
        cabinTypeCodes: ['5'],
        includeOriginDestId: false,
        includeLangUsage: true,
        includePaxListInOfferPrice: true,
        includePaymentFunctions: true,
        includeIndividualId: true,
        includeLangUsageInPax: true,
        includeRemark: true,
        remarkText: 'TESTPDT',
        multipleContactInfo: true,
      },
      agencyName: env.QR_AGENCY_NAME,
      iataNumber: env.QR_IATA_NUMBER,
      agencyId: env.QR_AGENCY_ID,
      posCountryCode: env.QR_POS_COUNTRY,
      timeout: parseInt(env.QR_TIMEOUT, 10) || 30000,
      retries: parseInt(env.QR_RETRIES, 10) || 3,
    },
    ac: {
      enabled: env.AIRLINE_AC_ENABLED === 'true',
      code: 'AC',
      ndcVersion: '17.2',
      transport: 'soap-apikey',
      ndcEndpoint: env.AC_NDC_ENDPOINT,
      endpoints: {
        airShopping: env.AC_EP_AIRSHOPPING,
        offerPrice: env.AC_EP_OFFERPRICE,
        orderCreate: env.AC_EP_ORDERCREATE,
        orderRetrieve: env.AC_EP_ORDERRETRIEVE,
      },
      authType: 'apiKey',
      apiKey: env.AC_API_KEY,
      apiKeyHeader: env.AC_API_KEY_HEADER,
      useSoapEnvelope: true,
      soapConfig: {
        envelopeAttrs: env.AC_SOAP_ENVELOPE_ATTRS,
        headerXml: (env.AC_SOAP_HEADER_XML || '').replace('{{SELLER_ID}}', env.AC_SELLER_ID || ''),
        ndcMsgEnvelope: {
          sellerId: env.AC_SELLER_ID,
          company: env.AC_SOAP_COMPANY,
          namespaceUri: env.AC_SOAP_NS_URI,
          nsPrefix: env.AC_SOAP_NS_PREFIX,
          schemaType: env.AC_SOAP_SCHEMA_TYPE,
          schemaVersion: env.AC_SOAP_SCHEMA_VERSION,
        },
      },
      // VP injection: AugmentationPoint
      vpInjection: 'augmentationPoint',
      // Builder profile
      builderProfile: {
        rootElement: 'AirShoppingRQ',
        versionAttr: '2017.2',
        xmlnsPrefix: true,
        xmlnsPrefixNs5: env.AC_XMLNS_NS5,
        xmlnsPrefixPre: env.AC_XMLNS_PRE,
        paxIdFormat: 'PTC_numeric',       // "ADT0", "ADT1"
        documentName: env.AC_DOCUMENT_NAME || 'NDC-Exchange',
        documentRefVersion: env.AC_DOCUMENT_REF_VERSION,
        includeLanguages: true,
        languageCode: 'en-CA',
        calendarDaysBefore: '0',
        calendarDaysAfter: '0',
        includeFlightRefs: true,
        includeServiceRefs: true,
        pointOfSaleCountry: 'CA',
        contactType: '1.PTT',
      },
      sellerId: env.AC_SELLER_ID,
      agencyId: env.AC_AGENCY_ID,
      iataNumber: env.AC_IATA_NUMBER,
      timeout: parseInt(env.AC_TIMEOUT, 10) || 30000,
      retries: parseInt(env.AC_RETRIES, 10) || 3,
    },
  },
};
