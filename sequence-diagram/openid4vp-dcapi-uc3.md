# Sequence Diagram — Use Case 3: OpenID4VP & DC API flow

This diagram illustrates the end-to-end flow for verifying a traveler's digital passport during the booking checkout using the W3C Digital Credentials API and Google Wallet.

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant TripApp as Trip.com Mobile App
    participant Hopae as Hopae Backend (Verifier)
    participant GWallet as Google Wallet (DC API)

    User->>TripApp: 1. Tap "Share Passport with Wallet"
    TripApp->>Hopae: 2. Request Verification Session (Request Nonce)
    Note over Hopae: Generates OpenID4VP<br/>Presentation Request (Signed)
    Hopae-->>TripApp: 3. Return Presentation Request
    
    TripApp->>GWallet: 4. Invoke Digital Credentials API with Request payload
    Note over GWallet: Processes request and locates<br/>the matching Digital Passport
    
    GWallet->>User: 5. Native OS Prompt for Consent (Displays data to share)
    User-->>GWallet: 6. Authorize sharing (FaceID / Fingerprint / PIN)
    
    Note over GWallet: Generates VP Token<br/>(Verifiable Presentation)
    GWallet-->>TripApp: 7. Return VP Token to the App
    
    TripApp->>Hopae: 8. Submit VP Token for Validation
    Note over Hopae: Cryptographically validates:<br/>Issuer Signature, User Binding, and Nonce
    Hopae-->>TripApp: 9. Return Verification Success
    
    TripApp-->>User: 10. Update UI (Identity Verified)
```
