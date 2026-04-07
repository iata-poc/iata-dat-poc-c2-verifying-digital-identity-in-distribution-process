# High-Level Architecture
## IATA Digital Identity in Modern Retailing PoC 2026

This document details the high-level architecture, system components, and process flows for integrating Verifiable Digital Identity into the airline NDC distribution ecosystem across three distinct use cases.

> Detailed sequence diagrams for these flows can be found in the respective files:
> [UC1 — Agency Booking System](/sequence-diagram/uc1.md) · [UC2 — Travel Agent Desktop](/sequence-diagram/uc2.md) · [UC3 — Customer Verification](/sequence-diagram/uc3.md)



## Use Case 1 — Agency Booking System

This scenario involves a large-scale travel agency (the "End Seller") that uses a shopping engine to fetch airline offers. Instead of relying on unverified metadata to identify itself, the agency's system automatically signs every NDC request with a Verifiable Presentation (VP) token which contains the organizational identity of the travel agency.

Once generated, this VP token is passed into the NDC channel and routed to the airlines connected via an aggregator. This enables the airline to cryptographically verify the specific agency behind any NDC transaction.

![Use Case 1 Diagram](/img/uc1-diagram.png)

### Actor & Component Roles

- **Travel Agency** — The Holder of the Organizational VC.
- **Organizational Wallet** — Secure cloud storage that manages the Travel Agency Organizational VC.
- **Internal Shopping System** — The engine that generates a unique VP token for each NDC transaction by binding the TA Identity to the Transaction ID.
- **Aggregator** — The intermediary providing the Unified JSON Endpoint and the NDC Translation Layer to route requests to multiple airlines.
- **Airlines** — The Verifiers that receive the NDC request and validate the Agency identity through their Identity Verification Service.

### Process Steps

1. **Identity Onboarding** — The travel agency imports its verified Agency VC from the cloud wallet into the secure storage of its internal shopping system.
2. **Transaction-Level Binding** — When an NDC transaction is initiated, the system retrieves the TA identity and combines it with the unique Transaction ID. A unique VP token is generated, cryptographically binding the agency's credentials to that specific request.
3. **Unified API Call** — The agency sends a Unified Distribution API call containing the NDC query and the bound VP token to the aggregator.
4. **NDC Routing** — The aggregator translates the request into an NDC message and routes it to the airline's NDC Gateway while preserving the VP token.
5. **Verified Transaction** — The airline extracts the VP token from the NDC message and verifies it. Ensuring the identity is valid from a trusted travel agency, the Airline Retailing Core processes the request.


## Use Case 2 — Travel Agent Desktop

This scenario involves a travel agent holding a Travel Agency Employee VC who accesses airline content via a Travel Agency Desktop. Instead of relying on traditional login/password credentials, the agent uses their Travel Agency Employee VC stored in a mobile wallet to prove their professional identity.

The agent initiates a secure login by scanning a QR code on the desktop, triggering a session-based proof of identity (VP token). For every retailing transaction (Search, OfferPrice, OrderCreate), the backend system automatically attaches this verified VP token to the request.

![Use Case 2 Diagram](/img/uc2-diagram.png)

### Actor & Component Roles

- **Travel Agent Employee** — The Holder of the Travel Agency Employee VC that performs the Retailing Transactions.
- **Mobile Wallet** — The agent's mobile wallet that secures and manages the Travel Agency Employee VC.
- **Travel Agency Desktop App** — The app containing the Digital Identity Verification module for authentication and identification of the agent using VCs.
- **Desktop Backend System** — The logic engine that maintains the session state and passes the verified VP token to the aggregator.
- **Aggregator** — The intermediary providing the Unified JSON Endpoint and the NDC Translation Layer to route requests to multiple airlines.
- **Airlines** — The Verifiers that receive the NDC request and validate the Agency identity through their Identity Verification Service.

### Process Steps

1. **Identification and Authentication** — The agent logs into the app by scanning a QR code with their mobile wallet, presenting their Agency Employee VC.
2. **Session Binding** — The Digital Identity Verification module validates the presentation and passes a verified VP token to the Desktop Backend System, which binds it to the agent's active session.
3. **Retailing Request** — The agent performs a shopping or order request. The backend's Business Logic retrieves the VP token, attaches it to the JSON payload, and sends the request to the aggregator's Unified JSON Endpoint.
4. **NDC Translation & Routing** — The aggregator converts the request into an NDC message, embedding the VP token, and routes it to the airline's NDC Gateway.
5. **Verified Transaction** — The airline extracts the VP token from the NDC message and verifies it. Ensuring the identity is valid from a trusted travel agency, the Airline Retailing Core processes the request.


## Use Case 3 — Customer Verification (ePassport)

This scenario addresses the challenge of manual data entry in the customer booking flow. It involves a traveler who has previously digitized their physical ePassport into a digital copy stored in a mobile wallet.

When booking a flight on a mobile app, the traveler consents to share their verified identity information instead of typing their details. This verified data is passed through the seller's infrastructure and injected into the NDC OrderCreate flow, ensuring the identity information in the booking perfectly matches the traveler's official government passport.

![Use Case 3 Diagram](/img/uc3-diagram.png)

### Actor & Component Roles

- **Customer** — The Holder of the digital copy of the Passport. Controls the wallet and consents to sharing data.
- **Mobile Wallet** — The customer's mobile wallet that secures and manages the digital copy of the Passport.
- **OTA Mobile App** — The primary booking interface used by the traveler to initiate the search, manage the booking flow, and request the digital passport from the wallet.
- **Identity Verification Service (OTA)** — The OTA's internal module that receives the customer data in the form of a digital passport presentation and performs Customer Identity Verification.
- **Aggregator** — The intermediary providing the Unified JSON Endpoint and the NDC Translation Layer to route requests to multiple airlines.
- **Airlines** — The Verifiers that receive customer data in the form of a digital passport presentation and perform Customer Identity Verification.

### Process Steps

1. **Digital Passport Creation** — The customer creates a self-derived digital copy of their passport by scanning their physical passport and reading the secure NFC chip with their smartphone.
2. **Presentation & Consent** — During the booking flow, the customer selects "present passenger details with wallet." The mobile app triggers a request. The customer reviews it in their wallet and consents to present their Digital Passport attributes.
3. **Verification** — The OTA app sends the VP to an internal Identity Verification Service to ensure the data is authentic and hasn't been tampered with.
4. **Gateway Integration** — The verified VP token is passed to the Aggregator Integration Gateway, which bundles it with the booking request.
5. **Unified API Call** — The OTA sends the Unified Distribution API call to its internal aggregator system.
6. **NDC Translation & Routing** — The NDC Translation Layer converts the request into an NDC message, embedding the traveler's VP token.
7. **Airline Extraction** — The airline's NDC Gateway parses the incoming message and extracts the customer's VP token.
8. **Final Verification** — The airline's Identity Verification Service validates the Digital Passport presentation.
9. **Order Fulfillment** — The Airline Retailing Core creates the order, knowing with 100% certainty that the customer details are correct.
