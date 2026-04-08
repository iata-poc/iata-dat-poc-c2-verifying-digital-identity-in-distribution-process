# Qatar Airways NDC Air Shopping with Digital Identity Implementation PoC

## Overview

This implementation describes the full request flow from **Dreamix** (travel agency client) through the **API Gateway**, the **NDCAirShopping middleware API**, **Hopae DID verification**, and finally to the **Amadeus GDS** aggregator.

The single endpoint `POST /api/AirShopping/air-shopping` handles all four NDC IATA operations, dispatched by the SOAP body root element:

| SOAP Body Root Element   | NDC Operation   |
|--------------------------|-----------------|
| `IATA_AirShoppingRQ`     | Air Shopping    |
| `IATA_OfferPriceRQ`      | Offer Price     |
| `IATA_OrderCreateRQ`     | Order Create    |
| `IATA_OrderRetrieveRQ`   | Order Retrieve  |

---

## Sequence Diagram

![NDC Air Shopping Flow](../img/qa_ndc_air_shopping_flow.svg)

---

## Key Implementation Notes

### DID / VP Token Flow
- **Dreamix** embeds a **Verifiable Presentation (VP)** token (issued by Hopae) inside the SOAP body under `DistributionChain → DistributionChainLink[OrgRole=Seller] → VerifiablePresentation → VP_Token`.
- The **IATA number** of the seller is carried alongside in `ParticipatingOrg → OrgID`.
- The API extracts both fields and posts them to the Hopae verification endpoint. Verification is gated by the `Hopae:Enabled` configuration flag.

### WS-Security PasswordDigest Generation
- Nonce and Created are freshly generated per request to prevent replay attacks.
- The clear-text password is supplied by the caller inside the incoming SOAP (POC mode) and then discarded after digest generation.

### NDC Version Transform (24.1 → 21.3)
Since Dreamix sends NDC 24.1 payloads and Amadeus expects NDC 21.3, the API strips 24.1-specific nodes (`VerifiablePresentation`, `SalesBranch`) and reshapes the `DistributionChain` to the three-link structure (Seller → Distributor → Carrier) expected by Amadeus 21.3.
