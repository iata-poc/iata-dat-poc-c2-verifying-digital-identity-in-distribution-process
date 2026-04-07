# Schemas

This directory contains the data schemas and namespace definitions used to generate, share, and verify Verifiable Credentials across the PoC.
These schemas ensure that Verifiable Credentials  adhere to global standards, enabling interoperability between actors in the travel ecosystem. 

## 1. Employee Agency Credential — `employeeAgency-sdjwt.json`

- **Used in:** Use Case 2 — Travel Agent Desktop
- **Format:** SD-JWT VC (Selective Disclosure JWT)

This JSON schema defines the structure for a Travel Agency Employee Verifiable Credential. It contains the data elements necessary to  verify an individual agent's identity and their employment status at a specific travel agency. 

---

## 2. Digital Passport / Photo ID — `iso-photoid.md`

- **Used in:** Use Case 3 — Customer Verification / B2C Checkout
- **Format:** ISO/IEC 23220-4 & ICAO 9303

This file documents the namespaces and data elements required to represent a digitized physical ePassport in a mobile wallet. Based on the ISO/IEC 23220-4 standard, it defines how biographic data (name, birth date, nationality), portrait imagery, and machine-readable zone (MRZ) data groups are encoded.

In the PoC, this schema acts as the standard data structure passed securely from the traveler's consumer wallet to the OTA, and subsequently downstream to the airline via the W3C Digital Credentials API.
