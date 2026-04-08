# IATA Digital Identity B2C PoC — NDC Aggregator

A Proof-of-Concept travel agency desktop application that integrates **IATA Digital Identity** (Verifiable Credentials via OpenID4VP) with airline **NDC** (New Distribution Capability) APIs. It demonstrates how verified agency credentials can be cryptographically embedded into every flight booking request — from search to booking confirmation — across multiple airlines using different NDC versions.

## Key Capabilities

| Capability | Details |
|------------|---------|
| **IATA Digital Identity** | Two authentication use cases — agency admin VC upload (UC1) and agent wallet QR scan (UC2) via OpenID4VP |
| **Multi-airline NDC aggregation** | Four airline integrations across NDC 17.2 and 21.x, queried in parallel |
| **NDC capabilities integration** | Unified connectivity to airline NDC endpoints with per-airline configuration and automatic version-based dispatching |
| **VP token injection** | SD-JWT Verifiable Presentation embedded in every NDC XML request for airline-side digital identity verification |
| **Unified booking flow** | Search → Reprice → Book with a single UI regardless of underlying NDC version differences |
| **Currency normalization** | All prices converted to USD server-side before reaching the frontend |
| **VP revocation handling** | Revoked credentials are detected in-band and handled gracefully (silent exclusion during search, clear error during booking) |
| **Fully externalized config** | All airline NDC endpoints, credentials, and namespace URIs driven by environment variables |

---

## System Architecture

```mermaid
graph TB
    subgraph Client["Frontend (Vite + React)"]
        UI[Travel Agency UI]
        Auth[Authentication Pages]
        Search[Search & Booking Flow]
    end

    subgraph Server["Backend (Express.js)"]
        MW[Hybrid Auth Middleware]
        Routes[NDC Routes]

        subgraph NDC["NDC Engine"]
            BD[Builder Dispatcher]
            subgraph Builders["XML Builders"]
                B21x[NDC 21.x Builders]
                B172[NDC 17.2 Builders]
            end
            subgraph Parsers["XML Parsers"]
                P21x[NDC 21.x Parser]
                P172[NDC 17.2 Parser]
            end
            subgraph Transports["NDC Connectivity"]
                TOAuth[Airline Connector A]
                TSOAP[Airline Connector B]
                TSub[Airline Connector C]
            end
        end

        VPGen[VP Generation Service]
        Agg[Aggregator Service]
        Stores[(Search Context · Orders · VC Store)]
    end

    subgraph External["External Services"]
        Hopae[Hopae Verifier<br/>OpenID4VP + VP Generation]
        Airlines["Airline NDC APIs"]
    end

    UI --> MW
    Auth --> Hopae
    MW --> VPGen
    VPGen --> Hopae
    MW --> Routes
    Routes --> Agg
    Agg --> BD
    BD --> B21x & B172
    B21x & B172 --> TOAuth & TSOAP & TSub
    TOAuth & TSOAP & TSub --> Airlines
    Airlines --> P21x & P172
    P21x & P172 --> Agg
    Agg --> Stores
```

### Monorepo Structure

```
ndc-aggregator/
├── client/                         # Frontend — Vite + React + Bootstrap
│   └── src/
│       ├── App.jsx                 # Router + global auth state
│       ├── pages/                  # Route-level page components
│       │   ├── login.jsx           # UC1 agency login + UC2 IATA ID Card entry
│       │   ├── authentication.jsx  # UC2 QR code display + polling
│       │   ├── homePage.jsx        # Search form landing page
│       │   ├── searchPage.jsx      # Flight search results
│       │   ├── flightDetailModal.jsx    # Fare detail modal with cabin grouping
│       │   ├── passengerInfoPage.jsx    # Passenger form + contact info
│       │   ├── confirmationPage.jsx     # Booking summary + payment
│       │   ├── bookingSuccessPage.jsx   # Booking confirmation
│       │   └── settingsPage.jsx    # Settings sidebar + VC management (UC1)
│       ├── shared/                 # Reusable components (SearchForm, etc.)
│       └── services/
│           ├── api.js              # All backend API calls with auth headers
│           └── helpers.js          # Airline logos, formatters, fare grouping
├── server/                         # Backend — Express.js (Node.js ESM)
│   └── src/
│       ├── server.js               # Express app setup & route mounting
│       ├── config.js               # Environment-driven airline configuration
│       ├── routes/
│       │   ├── authRoutes.js       # POST /auth/login, POST/GET/DELETE /auth/vc
│       │   ├── credentialRoutes.js # Credential status check & toggle
│       │   ├── verificationRoutes.js  # QR verification session lifecycle
│       │   └── ndcRoutes.js        # Authenticated NDC operations
│       ├── middlewares/
│       │   └── authMiddleware.js   # Hybrid auth: VP token / Agency token / Verification ID
│       ├── ndc/
│       │   ├── builders/           # Profile-driven NDC XML request builders
│       │   │   ├── index.js        # Version-based builder dispatcher
│       │   │   ├── agencyDataResolver.js  # Unified agency data resolution
│       │   │   ├── ndc21x/         # NDC 21.x builders (AirShopping, OfferPrice, OrderCreate)
│       │   │   └── ndc172/         # NDC 17.2 builders (AirShopping, OfferPrice, OrderCreate)
│       │   ├── parsers/            # Version-auto-detecting NDC XML response parsers
│       │   │   ├── airShoppingParser.js     # Auto-detect + NDC 21.x parsing
│       │   │   ├── airShopping172Parser.js  # NDC 17.2 parsing
│       │   │   ├── offerPriceParser.js      # Auto-detect + NDC 21.x
│       │   │   ├── offerPrice172Parser.js   # NDC 17.2
│       │   │   ├── orderViewParser.js       # Auto-detect + NDC 21.x
│       │   │   └── orderView172Parser.js    # NDC 17.2
│       │   ├── transports/         # NDC connectivity layer (airline client factories)
│       │   │   ├── index.js        # Transport registry & factory
│       │   │   ├── oauthRestTransport.js       # NDC connector (token-based auth)
│       │   │   ├── soapApiKeyTransport.js      # NDC connector (key-based auth)
│       │   │   └── soapSubscriptionTransport.js # NDC connector (subscription-based auth)
│       │   ├── clients.js          # Dynamic airline client registry
│       │   └── debugLogger.js      # XML request/response file logger
│       ├── services/
│       │   ├── ndcAggregatorService.js  # Multi-airline parallel orchestration
│       │   ├── repricingService.js      # OfferPrice flow with price comparison
│       │   ├── orderService.js          # OrderCreate flow
│       │   └── vpGenerationService.js   # UC1: Generate VP from stored VC via Hopae
│       ├── stores/
│       │   ├── searchContextStore.js    # In-memory search results + offers
│       │   ├── orderStore.js            # In-memory created orders
│       │   └── vcStore.js               # Agency VC (disk-persisted)
│       ├── verifiers/
│       │   └── hopaeClient.js           # Hopae OpenID4VP API client
│       ├── utils/
│       │   └── currencyConverter.js     # FX rates to USD
│       ├── sessionStore.js              # In-memory verification sessions (30-min TTL)
│       ├── agentProfileExtractor.js     # Agent profile from Hopae claims / VP JWT
│       └── appError.js                  # Custom error class
└── .env                            # Environment configuration (not committed)
```

### Runtime Topology

| Mode | Frontend | Backend | Communication |
|------|----------|---------|---------------|
| **Development** | Vite dev server `:5173` | Express `:3000` | Vite proxy `/api` → Express |
| **Production** | `vite build` → `server/public/` | Express `:3000` | Express serves SPA + API |

---

## Quick Start

```bash
# Install all dependencies
npm run install:all

# Copy and configure environment
cp server/.env.template server/.env
# Edit server/.env with your airline credentials, Hopae URL, etc.

# Run both frontend and backend in development
npm run dev

# Or run separately:
npm run start:dev    # Backend only (port 3000)
npm run client:dev   # Frontend only (port 5173)

# Production build
npm run build        # Builds client → server/public/
npm start            # Serves everything from Express
```

---

## IATA Digital Identity — Authentication Flows

The system supports two use cases for authenticating travel agents using **IATA Digital Identity** (W3C Verifiable Credentials + OpenID4VP).

### UC1 — Agency Admin Flow (VC Upload)

The agency admin logs in with credentials, uploads a W3C VCDM Verifiable Credential, and the system generates VP tokens on-the-fly for each subsequent NDC request via the Hopae verifier API.

```mermaid
sequenceDiagram
    actor Admin as Agency Admin
    participant FE as Frontend
    participant BE as Backend
    participant Store as VC Store (disk)
    participant Hopae as Hopae Verifier

    Admin->>FE: Login (username / password)
    FE->>BE: POST /auth/login
    BE-->>FE: X-Agency-Token (JWT)

    Admin->>FE: Upload VC JSON (Settings page)
    FE->>BE: POST /auth/vc (X-Agency-Token)
    BE->>Store: Persist VC to disk
    BE-->>FE: VC stored ✓

    Note over Admin,Hopae: On every NDC request (search / reprice / book):

    Admin->>FE: Search flights
    FE->>BE: POST /shopping/air (X-Agency-Token)
    BE->>BE: Validate agency token
    BE->>Store: Load stored VC
    BE->>Hopae: POST /debug/vcdm/vp {vc, tx_id}
    Hopae-->>BE: {vp_token: "SD-JWT..."}
    BE->>BE: Extract agentProfile from VC subject
    BE->>BE: Build NDC XML with VP + agency data
    BE-->>FE: flights[]
```

### UC2 — Agent QR Scan Flow (OpenID4VP)

An individual travel agent authenticates by scanning a QR code with their IATA wallet app. The wallet presents a Verifiable Presentation directly to the Hopae verifier. The backend polls Hopae until verification is complete, then extracts the agent profile and VP token from the claims.

```mermaid
sequenceDiagram
    actor Wallet as Agent Wallet App
    participant FE as Frontend
    participant BE as Backend
    participant Session as Session Store
    participant Hopae as Hopae Verifier

    FE->>BE: POST /public/verifications {flow: "qr"}
    BE->>Hopae: POST /openid4vp/qr/start
    Hopae-->>BE: {requestUri, sessionId}
    BE->>Session: Create session (state: REQUESTED)
    BE-->>FE: {id, qrContent: requestUri}
    FE->>FE: Render QR code

    Wallet->>Hopae: Scan QR → Present VP (OpenID4VP)

    loop Poll every 3 seconds
        FE->>BE: GET /public/verifications/:id
        BE->>Hopae: GET /openid4vp/qr/status/:sessionId
        Hopae-->>BE: {status, verified, claims, payload}
    end

    Note over BE,Hopae: When status = "completed" + verified = true

    BE->>BE: Extract agent profile from claims
    BE->>Session: Update session (state: VERIFIED, vpToken, agentProfile)
    BE-->>FE: {state: VERIFIED}
    FE->>FE: Store verificationId, navigate to home

    Note over FE,BE: Subsequent NDC requests use X-Verification-Id header
```

### Hybrid Authentication Middleware

The `hybridAuthenticator` supports two auth patterns (checked in priority order). Both paths produce the same downstream data: `vpToken` (SD-JWT) + `agentProfile` (DID, agency name, IATA number).

```mermaid
flowchart TD
    REQ[Incoming NDC Request] --> CHECK{Which header?}
    CHECK -->|X-Agency-Token| AGENCY[Validate token<br/>Load VC from store<br/>Generate VP via Hopae]
    CHECK -->|X-Verification-Id| SESSION[Lookup session<br/>Check VERIFIED state<br/>Check 30-min TTL]
    CHECK -->|None| REJECT[401 Unauthorized]

    AGENCY --> OK[req.vpToken + req.agentProfile]
    SESSION --> OK
    OK --> ROUTE[NDC Route Handler]
```

| Priority | Header | Use Case | VP Source |
|----------|--------|----------|-----------|
| 1 | `X-Agency-Token` | UC1: Agency admin flow | Generated on-the-fly from stored VC via Hopae |
| 2 | `X-Verification-Id` | UC2: Agent QR scan flow | Stored in session from wallet presentation |

---

## Booking Flow — Search → Reprice → Book

### End-to-End Sequence

```mermaid
sequenceDiagram
    actor Agent as Travel Agent
    participant FE as Frontend
    participant BE as Backend
    participant Agg as Aggregator Service
    participant Build as Builder Dispatcher
    participant Transport as Transport Layer
    participant Airlines as Airline NDC APIs
    participant Parse as Parser (auto-detect)
    participant Store as Search Context Store

    Note over Agent,Airlines: ── Phase 1: Multi-Airline Parallel Search ──

    Agent->>FE: Enter search (origin, dest, dates, pax)
    FE->>BE: POST /shopping/air
    BE->>BE: hybridAuthenticator → extract vpToken + agentProfile
    BE->>Agg: executeAirShopping(builderFn, params, vpData)

    par Parallel requests to all enabled airlines
        Agg->>Build: buildAirShoppingForAirline(params, vpData, "TK")
        Build->>Build: Select NDC 21.x builder + TK builderProfile
        Build-->>Transport: AirShoppingRQ XML (with VP in DistributionChain)
        Transport->>Airlines: POST AirShopping (NDC 21.x endpoint)

        Agg->>Build: buildAirShoppingForAirline(params, vpData, "AC")
        Build->>Build: Select NDC 17.2 builder + AC builderProfile
        Build-->>Transport: AirShoppingRQ XML (with VP in AugmentationPoint)
        Transport->>Airlines: POST AirShopping (NDC 17.2 endpoint)
    end

    Airlines-->>Transport: AirShoppingRS XML responses
    Transport-->>Agg: Raw XML per airline

    Agg->>Parse: parseAirShoppingRS(xml, airlineCode)
    Parse->>Parse: Auto-detect: <IATA_AirShoppingRS> → 21.x / <AirShoppingRS> → 17.2
    Parse-->>Agg: Normalized offers[] (same JSON shape)

    Agg-->>BE: Combined results from all airlines
    BE->>BE: Convert prices to USD
    BE->>BE: Filter (max stops) → Group by flight → Best per airline
    BE->>Store: Store searchContext (offers, ndcRefs, vpData)
    BE-->>FE: {searchId, flights[]}

    Note over Agent,Airlines: ── Phase 2: Offer Repricing ──

    Agent->>FE: Select fare option
    FE->>BE: POST /shopping/offers/:offerId/reprice {searchId}
    BE->>Store: Lookup original offer + NDC references
    BE->>Build: buildOfferPriceForAirline(offerData, vpData, airlineCode)
    Build-->>Transport: OfferPriceRQ XML
    Transport->>Airlines: POST /OfferPrice (single airline)
    Airlines-->>Transport: OfferPriceRS XML
    Transport-->>Parse: Raw XML
    Parse-->>BE: Repriced price
    BE->>BE: Compare original vs repriced (in USD)
    BE-->>FE: {originalPrice, repricedPrice, priceChanged}

    Note over Agent,Airlines: ── Phase 3: Order Creation ──

    Agent->>FE: Fill passenger info + payment
    FE->>BE: POST /orders {searchId, offerId, passengers, payment}
    BE->>Store: Lookup offer + NDC references
    BE->>Build: buildOrderCreateForAirline(orderData, vpData, airlineCode)
    Build-->>Transport: OrderCreateRQ XML
    Transport->>Airlines: POST /OrderCreate (single airline)
    Airlines-->>Transport: OrderCreateRS / OrderViewRS XML
    Transport-->>Parse: Raw XML
    Parse-->>BE: Order details (bookingRef, status, segments)
    BE->>Store: Store order in orderStore
    BE-->>FE: {orderId, bookingReference, status, totalPrice}
```

### VP Token Injection

The VP token (SD-JWT) and agent profile data are embedded in different XML locations depending on the airline's NDC version and configuration:

```mermaid
flowchart LR
    VP[VP Token<br/>SD-JWT] --> VER{NDC Version?}
    VER -->|21.x| DC["DistributionChain ><br/>VerifiablePresentation ><br/>VP_Token"]
    VER -->|17.2| AP["AugmentationPoint ><br/>VerifiablePresentation"]
```

---

## Multi-Airline NDC Integration

### NDC Connectivity Layer

The connectivity layer abstracts away airline-specific endpoint differences so the rest of the system works with a uniform client interface (`airShopping`, `offerPrice`, `orderCreate`, `orderView`).

Each connector provides:
- **Automatic retry** with exponential backoff (configurable max retries)
- **Debug logging** — all NDC XML requests/responses written to disk when `DEBUG_LOGS_ENABLED=true`
- **Response normalization** — airline-specific envelope wrapping automatically stripped before parsing

### Builder & Parser Architecture

Builders and parsers are organized by **NDC version**, not per airline. Each builder reads a `builderProfile` from `config.js` to customize XML output for the specific airline's requirements.

```mermaid
flowchart TD
    REQ[NDC Operation Request] --> DISP[Builder Dispatcher<br/>index.js]
    DISP --> VER{airlineConfig.ndcVersion?}
    VER -->|21.36 / 21.3| B21["NDC 21.x Builder<br/>+ builderProfile customization"]
    VER -->|17.2| B17["NDC 17.2 Builder<br/>+ builderProfile customization"]

    B21 --> XML21[IATA_AirShoppingRQ XML]
    B17 --> XML17[AirShoppingRQ XML]

    XML21 --> SEND[NDC Connector → Airline]
    XML17 --> SEND

    SEND --> RESP[XML Response]
    RESP --> AUTO{Auto-detect root element}
    AUTO -->|"< IATA_AirShoppingRS >"| P21["NDC 21.x Parser"]
    AUTO -->|"< AirShoppingRS >"| P17["NDC 17.2 Parser"]

    P21 --> NORM[Normalized JSON<br/>Same shape for all airlines]
    P17 --> NORM
```

**Builder profiles** control dozens of XML generation parameters per airline without duplicating builder code:

| Profile Field | Purpose | Example Values |
|---------------|---------|---------------|
| `rootElement` | XML root element name | `n1:IATA_AirShoppingRQ` / `AirShoppingRQ` |
| `versionNumber` | Schema version attribute | `21.36`, `21.3`, `17.2` |
| `paxIdFormat` | Passenger ID format | `numeric` ("1"), `T_numeric` ("T1"), `PAX_numeric` ("PAX1") |
| `vpInjection` | VP token placement | `distributionChain` / `augmentationPoint` |
| `xmlnsPrefix*` | Custom namespace URIs | Airline-specific namespace declarations |
| `includePayloadAttributes` | Include IATA PayloadAttributes | `true` (21.36) / `false` (21.3) |
| `includeContacts` | Include contact details in Party | `true` (BA) / not set (AC) |

### VP Revocation Handling

```mermaid
flowchart TD
    REQ[NDC Request with VP] --> AIRLINE[Airline API]
    AIRLINE --> CHECK{VP Valid?}

    CHECK -->|Valid| OK[Normal Response]
    CHECK -->|Revoked - XML Error| XMLERR["Response contains<br/>DIGITAL_ID_VP_IS_REVOKED_ERROR"]
    CHECK -->|Revoked - HTTP 403| HTTP403[HTTP 403 Forbidden]

    XMLERR --> DETECT[detectVpRevocation]
    HTTP403 --> DETECT

    DETECT --> WHICH{Which operation?}
    WHICH -->|Search| SILENT["Silent exclusion<br/>Other airlines continue<br/>Empty result for this airline"]
    WHICH -->|Reprice / Order| ERROR["403 Error to user<br/>'VP credentials are revoked'"]
```

---

## API Reference

### Public Routes (No Auth)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/public/ping` | Health check |
| `POST` | `/api/public/verifications` | Start QR verification session (UC2) |
| `GET` | `/api/public/verifications/:id` | Poll verification status |

### Auth Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | None | Agency login → returns `X-Agency-Token` |
| `POST` | `/api/auth/vc` | `X-Agency-Token` | Upload agency VCDM VC (UC1) |
| `GET` | `/api/auth/vc` | `X-Agency-Token` | Get stored VC status |
| `DELETE` | `/api/auth/vc` | `X-Agency-Token` | Delete stored VC |

### Credential Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/credentials/status` | Check credential revocation status via Hopae StatusList |
| `PUT` | `/api/credentials/toggle` | Toggle credential revocation (revoke ↔ enable) |

### NDC Routes (Authenticated)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/shopping/air` | Multi-airline parallel flight search |
| `POST` | `/api/shopping/offers/:offerId/reprice` | Reprice a specific offer with the origin airline |
| `POST` | `/api/orders` | Create booking from selected + repriced offer |
| `GET` | `/api/orders/:orderId` | Retrieve order details |
| `GET` | `/api/orders` | List orders for current session |
| `GET` | `/api/me` | Get current agent profile (DID, agency, IATA#) |

All NDC routes use `hybridAuthenticator` — accepts `X-Agency-Token` or `X-Verification-Id`.

---

## Data Stores

All stores are **in-memory** except `vcStore` which persists to disk:

| Store | File | Persistence | Purpose |
|-------|------|-------------|---------|
| **Session Store** | `sessionStore.js` | Memory (30-min TTL) | Verification sessions + agent profiles + VP tokens |
| **Search Context** | `searchContextStore.js` | Memory | Search results, parsed offers, NDC refs for reprice/order |
| **Order Store** | `orderStore.js` | Memory | Created orders with booking references |
| **VC Store** | `vcStore.js` | Disk (`server/data/`) | Agency VCDM Verifiable Credential (UC1) |

---

## Security & Trust Model

```mermaid
flowchart LR
    subgraph Identity["IATA Digital Identity Layer"]
        VC[W3C VCDM<br/>Verifiable Credential]
        VP[SD-JWT<br/>Verifiable Presentation]
        DID[DID-based<br/>Agent Identity]
    end

    subgraph Verification["Verification"]
        Hopae[Hopae Verifier<br/>OpenID4VP]
        StatusList[StatusList 2021<br/>Revocation Check]
    end

    subgraph Transport["NDC Secure Connectivity"]
        Connectors[Airline NDC Connectors<br/>Per-airline authentication]
        Endpoints[NDC Capabilities Endpoints<br/>AirShopping · OfferPrice · OrderCreate]
    end

    VC --> Hopae
    Hopae --> VP
    VP --> DID
    StatusList --> Hopae

    VP -->|Embedded in NDC XML| Connectors
    Connectors --> Endpoints
```

- **Verifiable Credentials** — W3C VCDM format, stored encrypted on disk (UC1) or presented via wallet (UC2)
- **Verifiable Presentations** — SD-JWT format, generated per-request with unique `tx_id` for correlation
- **VP in every NDC request** — airlines can independently verify the agent's identity and agency affiliation
- **Revocation** — StatusList 2021 mechanism; revoked credentials are detected both during verification and in airline responses
- **No hardcoded secrets** — all NDC endpoints, credentials, and namespace URIs externalized to `.env`
- **Agent profile cascade** — identity data flows from VC claims → airline config → empty (no fallback defaults in code)

---

## Environment Configuration

Copy `server/.env.template` to `server/.env` and fill in the required values. All airline-specific configuration is fully externalized:

| Category | Variables | Purpose |
|----------|-----------|---------|
| **Server** | `WEB_PORT`, `WEB_HOST_URL`, `WEB_ALLOWED_ORIGINS` | Express server config |
| **Agency Auth** | `AGENCY_USERNAME`, `AGENCY_PASSWORD` | UC1 login credentials |
| **Hopae Verifier** | `HOPAE_API_URL` | OpenID4VP verifier endpoint |
| **Per-airline core** | `{CODE}_NDC_ENDPOINT`, `AIRLINE_{CODE}_ENABLED` | NDC API base URL + enable flag |
| **Per-airline auth** | `{CODE}_API_KEY`, `{CODE}_CLIENT_ID/SECRET`, `{CODE}_SUBSCRIPTION_KEY` | NDC endpoint credentials |
| **Per-airline connectivity** | `{CODE}_SOAP_ENVELOPE_ATTRS`, `{CODE}_SOAP_HEADER_XML`, `{CODE}_SOAP_NS_*` | Airline-specific connectivity configuration |
| **Per-airline builder** | `{CODE}_XMLNS_*`, `{CODE}_DOCUMENT_*` | Builder profile namespace URIs |
| **Per-airline agency** | `{CODE}_AGENCY_NAME`, `{CODE}_IATA_NUMBER`, `{CODE}_AGENCY_ID` | Agency identity for NDC Party |
| **Per-airline endpoints** | `{CODE}_EP_AIRSHOPPING`, `{CODE}_EP_OFFERPRICE`, etc. | Operation-specific paths |
| **Debug & Demo** | `DEBUG_LOGS_ENABLED`, `DEMO_MODE` | Development aids |
| **PoC Filters** | `POC_MODE`, `POC_MAX_STOPS`, `POC_MAX_OFFERS` | Result filtering |

---

## Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, Vite 7, Bootstrap 5, React Router 7, React Select, React Datepicker, qrcode.react |
| **Backend** | Node.js (ESM), Express 5, Axios, fast-xml-parser, jwt-decode, uuid, dotenv |
| **Identity** | W3C VCDM, SD-JWT, OpenID4VP, DID, StatusList 2021 |
| **NDC Standards** | IATA NDC 17.2, IATA NDC 21.3, IATA NDC 21.36 |
| **NDC Integration** | IATA NDC XML messaging, per-airline endpoint connectivity, version-based dispatching |
| **Development** | nodemon, concurrently, cross-env |
