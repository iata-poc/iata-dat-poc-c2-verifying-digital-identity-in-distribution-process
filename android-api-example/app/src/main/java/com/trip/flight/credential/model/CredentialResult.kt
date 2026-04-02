package com.trip.flight.credential.model

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import org.json.JSONObject

data class CredentialResult(
    val verified: Boolean,
    val format: String,
    val type: String,
    val portraitBitmap: Bitmap?,
    val claims: List<ClaimField>,
)

data class ClaimField(
    val label: String,
    val value: String,
)

fun parseCredentialResult(json: JSONObject): CredentialResult {
    val verified = json.optBoolean("verified", false)
    val format = json.optString("format", "")
    val type = json.optJSONObject("metadata")?.optString("type", "") ?: ""

    val claimsJson = json.optJSONObject("claims") ?: JSONObject()

    val fields = mutableListOf<ClaimField>()
    var portraitBitmap: Bitmap? = null

    fields.add(ClaimField("Given Name", claimsJson.optString("given_name", "")))
    fields.add(ClaimField("Family Name", claimsJson.optString("family_name", "")))

    val birthDateObj = claimsJson.optJSONObject("birth_date")
    val birthDate = birthDateObj?.optString("birth_date", "") ?: claimsJson.optString("birth_date", "")
    fields.add(ClaimField("Birth Date", birthDate))

    val sexCode = claimsJson.optInt("sex", 0)
    val sexDisplay = when (sexCode) {
        1 -> "Male"
        2 -> "Female"
        else -> sexCode.toString()
    }
    fields.add(ClaimField("Sex", sexDisplay))

    fields.add(ClaimField("Nationality", claimsJson.optString("nationality", "")))
    fields.add(ClaimField("Document Number", claimsJson.optString("document_number", "")))
    fields.add(ClaimField("Issue Date", claimsJson.optString("issue_date", "")))
    fields.add(ClaimField("Expiry Date", claimsJson.optString("expiry_date", "")))
    fields.add(ClaimField("Issuing Country", claimsJson.optString("issuing_country", "")))

    val portraitDataUri = claimsJson.optString("portrait", "")
    if (portraitDataUri.isNotEmpty()) {
        val base64Prefix = ";base64,"
        val base64Index = portraitDataUri.indexOf(base64Prefix)
        if (base64Index != -1) {
            val base64Data = portraitDataUri.substring(base64Index + base64Prefix.length)
            val bytes = Base64.decode(base64Data, Base64.DEFAULT)
            portraitBitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        }
    }

    return CredentialResult(
        verified = verified,
        format = format,
        type = type,
        portraitBitmap = portraitBitmap,
        claims = fields,
    )
}
