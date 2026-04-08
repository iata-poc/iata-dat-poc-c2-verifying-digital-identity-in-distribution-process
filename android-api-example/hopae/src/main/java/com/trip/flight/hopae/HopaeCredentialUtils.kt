package com.trip.flight.hopae

import android.content.Context
import com.trip.flight.hopae.services.ServerRequestHandler
import com.trip.flight.hopae.wallet.WalletCredentialHandler
import org.json.JSONArray
import org.json.JSONObject

object HopaeCredentialUtils {
    /**
     * Retrieves and verifies credential details from the user's wallet.
     *
     * Performs three sequential steps:
     * 1. Requests a credential challenge from the server.
     * 2. Presents the challenge to the wallet and obtains the user's credential.
     * 3. Sends the wallet response back to the server for verification.
     *
     * @param context The application context.
     * @param expectedOrigins The list of expected origins for the credential request.
     * @return The server's verification result as a [JSONObject].
     * @throws com.trip.flight.hopae.services.ServerRequestException If any server request fails.
     * @throws androidx.credentials.exceptions.GetCredentialException If wallet credential retrieval fails.
     * @throws com.trip.flight.hopae.wallet.UnexpectedCredentialException If the wallet returns an unexpected credential type.
     */
    suspend fun getCredentialDetailsFromWallet(
        context: Context,
        expectedOrigins: List<String>,
    ): JSONObject {
        val walletCredentialHandler = WalletCredentialHandler(context)
        val serverRequestHandler = ServerRequestHandler(context)

        // Step 1: Request credential challenge from server
        val response =
            serverRequestHandler.requestCredentialFromServer(
                serverUrlString = context.getString(R.string.server_request_url),
                jsonData = JSONObject().put(ServerRequestHandler.EXPECTED_ORIGIN, expectedOrigins),
            )

        val sessionId = response.getString(ServerRequestHandler.SESSION_ID)

        // Step 2: Get credential from wallet
        val responseJson =
            walletCredentialHandler.getCredentialDetailsFromWallet(
                requestJson =
                    JSONObject()
                        .put(
                            WalletCredentialHandler.KEY_REQUESTS,
                            JSONArray().put(response.getJSONObject(ServerRequestHandler.KEY_REQUEST)),
                        ).toString(),
            )

        // Step 3: Send wallet response to server for verification
        return serverRequestHandler.sendWalletResponseToServer(
            serverUrlString = context.getString(R.string.server_verify_url, sessionId),
            jsonData = JSONObject(responseJson).getJSONObject(WalletCredentialHandler.KEY_DATA),
        )
    }
}
