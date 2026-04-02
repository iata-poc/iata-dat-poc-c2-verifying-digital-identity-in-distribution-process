package com.trip.flight.hopae.services

import android.content.Context
import android.util.Log
import com.trip.flight.hopae.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.DataOutputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

/**
 * Handles communication with the server for credential requests and validation.
 *
 * @property context The application context.
 */
class ServerRequestHandler(
    private val context: Context,
) {
    /**
     * Requests credential details from the server.
     *
     * Sends a POST request to the specified server URL with the given JSON data
     * and returns the parsed response.
     *
     * @param serverUrlString The URL of the server endpoint to request credentials from.
     * @param jsonData The JSON data to send in the request body.
     * @return The server response parsed as a [JSONObject].
     * @throws ServerRequestException If the request fails, returns a non-success HTTP status,
     *   or the response cannot be parsed as JSON.
     */
    suspend fun requestCredentialFromServer(
        serverUrlString: String,
        jsonData: JSONObject,
    ): JSONObject {
        val response = makePostRequest(serverUrlString, jsonData)
        return try {
            JSONObject(response)
        } catch (e: Exception) {
            Log.e("ServerRequest", "Error parsing JSON response: ${e.message}")
            throw ServerRequestException(
                context.getString(R.string.parse_server_response_error),
                e,
            )
        }
    }

    /**
     * Sends the wallet response to the server for validation.
     *
     * Sends a POST request to the specified server URL with the wallet response JSON data
     * and returns the parsed validation result.
     *
     * @param serverUrlString The URL of the server endpoint for validation.
     * @param jsonData The JSON data containing the wallet response to send for validation.
     * @return The validation response parsed as a [JSONObject].
     * @throws ServerRequestException If the request fails, returns a non-success HTTP status,
     *   or the response cannot be parsed as JSON.
     */
    suspend fun sendWalletResponseToServer(
        serverUrlString: String,
        jsonData: JSONObject,
    ): JSONObject {
        val response = makePostRequest(serverUrlString, jsonData)
        return try {
            JSONObject(response)
        } catch (e: Exception) {
            Log.e("ServerValidation", "Error parsing JSON response: ${e.message}")
            throw ServerRequestException(
                context.getString(R.string.parse_server_validation_error),
                e,
            )
        }
    }

    /**
     * Makes a POST request to the server and returns the raw response body.
     *
     * @param serverUrlString The URL for the POST request.
     * @param jsonData The JSON data to send in the request body.
     * @return The response body as a [String].
     * @throws ServerRequestException If the server returns a non-success HTTP status
     *   or a network error occurs.
     */
    private suspend fun makePostRequest(
        serverUrlString: String,
        jsonData: JSONObject,
    ): String =
        withContext(Dispatchers.IO) {
            try {
                val serverUrl = URL(serverUrlString)
                val connection = serverUrl.openConnection() as HttpURLConnection

                connection.requestMethod = "POST"
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("Accept", "application/json")

                val outputStream = DataOutputStream(connection.outputStream)
                outputStream.write(jsonData.toString().toByteArray(StandardCharsets.UTF_8))
                outputStream.flush()
                outputStream.close()

                val responseCode = connection.responseCode
                if (responseCode == HttpURLConnection.HTTP_OK || responseCode == HttpURLConnection.HTTP_CREATED) {
                    val response = processSuccessfulResponse(connection)
                    connection.disconnect()
                    response
                } else {
                    val errorMessage = processFailedResponse(connection)
                    connection.disconnect()
                    throw ServerRequestException(
                        context.getString(R.string.request_to_server_failed, errorMessage),
                    )
                }
            } catch (e: ServerRequestException) {
                throw e
            } catch (e: Exception) {
                Log.e(
                    "SyncPostRequest",
                    "Exception during request to $serverUrlString: ${e.message}",
                    e,
                )
                throw ServerRequestException(
                    "Exception during request to $serverUrlString: ${e.message}",
                    e,
                )
            }
        }

    /**
     * Processes a successful HTTP response (200/201).
     * Reads the response body and logs the success.
     *
     * @param connection The [HttpURLConnection] representing the successful connection.
     * @return The response body as a [String].
     */
    private fun processSuccessfulResponse(connection: HttpURLConnection): String {
        val inputStream = BufferedReader(InputStreamReader(connection.inputStream))
        val response = inputStream.use { it.readText() }
        inputStream.close()
        Log.d("SyncPostRequest", "Success for URL: ${connection.url}")
        Log.d("SyncPostRequest", "Success Response Body: $response")
        return response
    }

    /**
     * Processes a failed HTTP response (non-200/201).
     * Reads the error stream and logs the error.
     *
     * @param connection The [HttpURLConnection] representing the failed connection.
     * @return The error response body as a [String], or a default message if the body is empty.
     */
    private fun processFailedResponse(connection: HttpURLConnection): String {
        val errorStream = connection.errorStream
        val errorResponse =
            errorStream?.bufferedReader()?.use { it.readText() } ?: "No error response body"
        errorStream?.close()
        Log.e("SyncPostRequest", "Error for URL: ${connection.url}")
        Log.e("SyncPostRequest", "Error Response Body: $errorResponse")
        return errorResponse
    }

    companion object {
        const val EXPECTED_ORIGIN = "expected_origins"
        const val KEY_REQUEST = "request"
        const val SESSION_ID = "sessionId"
    }
}
