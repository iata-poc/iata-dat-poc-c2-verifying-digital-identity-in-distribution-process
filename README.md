# Verifying Digital identity in Distribution Process — IATA PoC 2026

As airlines accelerate the adoption of NDC and Orders, maintaining full visibility into the entities that access and sell airline content is critical. This Proof of Concept explores how  Digital Identity can bridge the gap between trusting unverified data and cryptographically verifying the identity of participants in the travel ecosystem.

This PoC is separated into two distinct sections:
- **Agency Verification (B2B):** Securing the NDC distribution pipeline, verifying travel agencies and agents, and enabling Transparent Distribution.
- **Customer Verification (B2C):** Focuses on eliminating manual data entry by introducing  digital identity (specifically, digital passport copies presented directly from the customer wallet) into the checkout flow.

## Table of Contents
- [Problem Statement](#problem-statement)
- [PoC Objectives](#poc-objectives)
- [Use Cases](#use-cases)
- [Architecture & Standards](#architecture--standards)
- [Participating Organizations](#participating-organizations)
- [Documentation & Source Code](#documentation--source-code)


## Problem Statement

**Agency Verification (B2B)**
- **Security and Fraud Risk:** Without verified identity, it is difficult to trace bad actors back to a specific source when hidden behind a trusted aggregator.
- **Loss of Distribution Control:** Without knowing the specific sub-agency, airlines struggle to enforce distribution policies or grant access to specific content tiers.

**Customer Verification (B2C)**
- **Customer Data Friction:** Manual entry of traveler information is error-prone, impacting bookings online and resulting in costly resolution processes for airlines and sellers.

## PoC Objectives

**Agency Verification**
- **Transparent Distribution:** Enable airlines to see through every proxy, intermediary, and aggregator to identify the verified end seller with certainty.
- **Reusable Verification:** Once verified, a trusted identity can be reused across airlines, platforms, and channels.
- **Personalized Retailing:** Safely deliver tailored offers, private fares, and dynamic pricing to 100% verified sellers.

**Customer Verification**
- **Seamless Checkout:** Eliminate manual data entry by securely getting verified copy of digital passport data from the traveler's mobile wallet.

## Use Cases

### Agency Verification (B2B)

**Use Case 1 — Agency Booking System**
High-volume, system-to-system NDC requests. A large-scale travel agency automatically signs every NDC request with a Verifiable Presentation token. This token binds the organizational identity from a Cloud Wallet to the transaction, enabling the airline to  verify the specific agency behind any request routed through an aggregator.

**Use Case 2 — Travel Agent Desktop**
Individual agents accessing content via an intermediary platform. A travel agent authenticates using a Travel Agency Employee Digital ID card stored in their mobile wallet, scanning a QR code to trigger a session-based proof of identity. The backend system attaches this Verifiable Presentation token to every NDC request, ensuring the airline can verify the agency the agent represents.

### Customer Verification (B2C)

**Use Case 3 — Customer Verification**
Digitization of a physical ePassport during the booking flow. A traveler presents their copy of a Digital Passport attributes from a mobile wallet. The verified data is used by the seller (OTA) and provided into the NDC OrderCreate flow, ensuring airlines receive verified customer data directly from the source.


## Architecture & Standards
For a detailed breakdown of system components and process flows, see the [High-Level Architecture](architecture/high-level-architecture.md) document.

Sequence diagrams per use case: [UC1—Agency Booking System](/sequence-diagram/uc1.md) · [UC2—Travel Agent Desktop](/sequence-diagram/uc2.md) · [UC3—Customer Verification](/sequence-diagram/uc3.md)
| Use Case | Category | Standard | Purpose |
|---|---|---|---|
| UC1 | Data Model | W3C VCDM 2.0 | Credential data format to represent organizational identity for agencies. |
| UC1 & UC2 | Identifier | DID (Decentralized Identifiers) | Cryptographic anchor for the agency and agent, allowing the airline to verify the source of an NDC message without contacting the issuer. |
| UC2 | Format | SD-JWT VC | Credential format for the Agent Desktop flow to share the agency IATA number with the airline while keeping private agent data off the distribution pipe. |
| UC2 & UC3 | Protocol | OID4VP 1.0 | Standardized protocol to move identity claims from a mobile wallet to a relying application, supporting both QR-based and direct mobile interactions. |
| UC2 | Revocation | IETF Token Status List draft 15 | Enables airlines to verify that an agency or agent credential is still active in real time. |
| UC3 | Interface | DC API (Digital Credentials) | Interface within the mobile app that allows the traveler to securely share digital passport attributes into the booking checkout flow. |
| UC3 | Format | ISO 23220-4 (photoID) | Credential format for the Customer Verification flow to share verified passport attributes with an OTA or airline using selective disclosure. |
| UC3 | Trust Anchor | X.509 / PKI | Root of trust to validate the digital signatures of the digital passport issuer. |
| All UCs | NDC Integration | Versions 17.2 & 24.1 | Demonstrated the versatility of digital identity across multiple NDC flows and airlines. |

---

## Participating Organizations

**Airlines**

<table>
  <tr>
    <td align="center" width="160"><img src="img/aircanada.png" height="45"></td>
    <td align="center" width="160"><img src="img/ba.png" height="45"></td>
  </tr>
  <tr><td colspan="2" height="16"></td></tr>
  <tr>
    <td align="center" width="160"><img src="img/qatar.png" height="45"></td>
    <td align="center" width="160"><img src="img/tk-airlines.png" height="45"></td>
  </tr>
  <tr><td colspan="2" height="16"></td></tr>
</table>

**Technology Partners and other organizations**
<table>
  <tr>
    <td align="center" width="160"><img src="img/arc.jpg" height="45"></td>
    <td align="center" width="160"><img src="img/dreamix.png" height="45"></td>
  </tr>
  <tr><td colspan="2" height="16"></td></tr>
  <tr>
    <td align="center" width="160"><img src="img/google_wallet.png" height="45"></td>
    <td align="center" width="160"><img src="img/hopae.png" height="45"></td>
  </tr>
  <tr><td colspan="2" height="16"></td></tr>
  <tr>
    <td align="center" width="160"><img src="img/infosys.png" height="45"></td>
    <td align="center" width="160"><img src="img/neoke.png" height="45"></td>
  </tr>
  <tr><td colspan="2" height="16"></td></tr>
  <tr>
    <td align="center" width="160"><img src="img/trip.png" height="45"></td>
  </tr>
</table>



| Use Case | Role / Component | Participating Organizations |
| :--- | :--- | :--- |
| **UC1 & UC2** | Airlines (NDC Verifiers) | Air Canada, IAG (British Airways), Qatar Airways, Turkish Airlines |
| **UC3** | Airlines (NDC Verifiers) | Air Canada, Japan Airlines, Turkish Airlines |
| **UC1 & UC2** | Travel Agency & Aggregator Systems | Dreamix |
| **UC3** | OTA / Travel Seller Mobile App | Trip.com |
| **UC2** | Agent Digital Wallet | neoke |
| **UC3** | Customer Digital Wallet | Google Wallet |
| **All UCs** | Identity Verification & Issuance Services | hopae |

## Documentation & Source Code

- Architecture Guidelines: [`/docs/architecture/high-level-architecture.md`](/docs/architecture/high-level-architecture.md)
