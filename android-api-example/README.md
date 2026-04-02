# Hopae Digital Credential Module

An Android library module that retrieves and verifies digital credentials (e-passport) through the [Hopae](https://iata-poc.dev.hopae.app/api#/) server and the Android [Credential Manager](https://developer.android.com/identity/sign-in/credential-manager) wallet.

## Architecture Overview

The module consists of three main components:

| Component | Responsibility |
|---|---|
| `HopaeCredentialUtils` | Public entry point. Orchestrates the full credential flow. |
| `ServerRequestHandler` | Communicates with the Hopae server (request challenge & verify response). |
| `WalletCredentialHandler` | Interacts with the on-device wallet via Android Credential Manager. |

## Call Flow

![Flow Chart](/art/flow_chart.png)

```
Caller (Activity / ViewModel)
  │
  │  ① HopaeCredentialUtils.getCredentialDetailsFromWallet(context, expectedOrigins)
  │
  ▼
ServerRequestHandler.requestCredentialFromServer()
  │  POST  https://iata-poc.dev.hopae.app/openid4vp/sessions?type=epassport
  │  Body:  { "expected_origins": [...] }
  │
  │  ◄── Hopae server returns a session containing `sessionId` and `request`
  │
  ▼
WalletCredentialHandler.getCredentialDetailsFromWallet(requestJson)
  │  Presents the OpenID4VP request to the Android Credential Manager.
  │  The user selects a credential in the system wallet UI.
  │
  │  ◄── Wallet returns a DigitalCredential JSON
  │
  ▼
ServerRequestHandler.sendWalletResponseToServer()
  │  POST  https://iata-poc.dev.hopae.app/openid4vp/verifications/{sessionId}
  │  Body:  the `data` object extracted from the wallet response
  │
  │  ◄── Hopae server returns the verification result
  │
  ▼
Returns JSONObject (verification result) to the caller
```

## Developer API

### Quick Start

All APIs are **suspend functions** and must be called from a coroutine scope.

```kotlin
// In an Activity or Fragment:
lifecycleScope.launch {
    try {
        val result: JSONObject = HopaeCredentialUtils.getCredentialDetailsFromWallet(
            context = this@MainActivity,
            expectedOrigins = listOf("https://your-app-origin.example.com"),
        )
        // result contains the Hopae server's verification response
        Log.d("Credential", "Verification result: $result")
    } catch (e: ServerRequestException) {
        // Server communication or response parsing failed
    } catch (e: GetCredentialCancellationException) {
        // User cancelled the wallet prompt
    } catch (e: NoCredentialException) {
        // No matching credential on device
    } catch (e: GetCredentialException) {
        // Other wallet errors
    } catch (e: UnexpectedCredentialException) {
        // Wallet returned a non-DigitalCredential type
    }
}
```

### `HopaeCredentialUtils`

The single public entry point for the credential flow.

```kotlin
object HopaeCredentialUtils {
    suspend fun getCredentialDetailsFromWallet(
        context: Context,
        expectedOrigins: List<String>,
    ): JSONObject
}
```

| Parameter | Type | Description |
|---|---|---|
| `context` | `Context` | An Android `Context` (typically an `Activity`). Required by both the Credential Manager and for loading server URLs from resources. |
| `expectedOrigins` | `List<String>` | Origins that the Hopae server should expect when creating the OpenID4VP session. |

**Returns:** A `JSONObject` containing the Hopae server's verification result.

**Throws:**

| Exception | When |
|---|---|
| `ServerRequestException` | Any Hopae server request fails (network error, non-2xx HTTP status, or unparseable JSON response). |
| `GetCredentialCancellationException` | The user dismissed the wallet UI. |
| `GetCredentialInterruptedException` | The wallet interaction was interrupted (e.g., app went to background). |
| `NoCredentialException` | No matching credential is available on the device. |
| `GetCredentialException` | Any other Credential Manager error. |
| `UnexpectedCredentialException` | The wallet returned a credential type other than `DigitalCredential`. |

### `ServerRequestHandler`

Handles HTTP POST communication with the Hopae server. Typically used internally by `HopaeCredentialUtils`, but can be used directly for advanced scenarios.

```kotlin
class ServerRequestHandler(context: Context) {
    suspend fun requestCredentialFromServer(
        serverUrlString: String,
        jsonData: JSONObject,
    ): JSONObject

    suspend fun sendWalletResponseToServer(
        serverUrlString: String,
        jsonData: JSONObject,
    ): JSONObject
}
```

Both methods throw `ServerRequestException` on failure.

### `WalletCredentialHandler`

Interacts with the Android Credential Manager to retrieve a `DigitalCredential` from the user's wallet. Typically used internally.

```kotlin
class WalletCredentialHandler(context: Context) {
    suspend fun getCredentialDetailsFromWallet(
        requestJson: String,
    ): String
}
```

Returns the raw credential JSON string. Throws `GetCredentialException` subclasses or `UnexpectedCredentialException` on failure.

### Exception Types

| Class | Package | Parent | Description |
|---|---|---|---|
| `ServerRequestException` | `com.trip.flight.hopae.services` | `Exception` | Hopae server request failure (network, HTTP error, or JSON parse error). Wraps the original cause when available. |
| `UnexpectedCredentialException` | `com.trip.flight.hopae.wallet` | `IllegalStateException` | The wallet returned a credential type that is not `DigitalCredential`. |

## Hopae Server Endpoints

The module communicates with two Hopae server endpoints, configured in `res/values/strings.xml`:

| Purpose | URL | HTTP Method |
|---|---|---|
| Create OpenID4VP session | `https://iata-poc.dev.hopae.app/openid4vp/sessions?type=epassport` | POST |
| Verify wallet response | `https://iata-poc.dev.hopae.app/openid4vp/verifications/{sessionId}` | POST |

## Module Structure

```
hopae/src/main/java/com/trip/flight/hopae/
├── HopaeCredentialUtils.kt          # Public API entry point
├── services/
│   ├── ServerRequestHandler.kt      # Hopae server communication
│   └── ServerRequestException.kt    # Server request failure exception
└── wallet/
    ├── WalletCredentialHandler.kt    # Android Credential Manager interaction
    └── UnexpectedCredentialException.kt  # Wrong credential type exception
```
