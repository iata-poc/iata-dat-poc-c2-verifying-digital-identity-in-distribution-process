package com.trip.flight.hopae.wallet

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.DigitalCredential
import androidx.credentials.ExperimentalDigitalCredentialApi
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetDigitalCredentialOption

/**
 * Handles interactions with the Android Credential Manager to get digital credentials from the wallet.
 *
 * @property context The application context.
 */
class WalletCredentialHandler(
    private val context: Context,
) {
    /**
     * Retrieves credential details from the user's wallet using the Android Credential Manager.
     *
     * @param requestJson The JSON string representing the credential request.
     * @return The credential response JSON string from the wallet.
     * @throws androidx.credentials.exceptions.GetCredentialCancellationException If the user cancelled the request.
     * @throws androidx.credentials.exceptions.GetCredentialInterruptedException If the request was interrupted.
     * @throws androidx.credentials.exceptions.NoCredentialException If no matching credential is available.
     * @throws androidx.credentials.exceptions.GetCredentialException For other credential retrieval errors.
     * @throws UnexpectedCredentialException If the returned credential is not a [DigitalCredential].
     */
    @OptIn(ExperimentalDigitalCredentialApi::class)
    suspend fun getCredentialDetailsFromWallet(requestJson: String): String {
        val credentialManager = CredentialManager.create(context)
        val digitalCredentialOption = GetDigitalCredentialOption(requestJson)
        val getCredRequest = GetCredentialRequest(listOf(digitalCredentialOption))

        val result =
            credentialManager.getCredential(
                context = context,
                request = getCredRequest,
            )

        return when (val credential = result.credential) {
            is DigitalCredential -> credential.credentialJson
            else -> throw UnexpectedCredentialException("Wrong credential type: ${credential.type}")
        }
    }

    companion object {
        const val KEY_REQUESTS = "requests"
        const val KEY_DATA = "data"
    }
}
