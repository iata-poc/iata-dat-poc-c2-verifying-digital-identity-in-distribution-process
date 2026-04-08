package com.trip.flight.credential.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.trip.flight.credential.model.ClaimField
import com.trip.flight.credential.model.CredentialResult
import com.trip.flight.credential.viewmodel.CredentialUiState

@Composable
fun CredentialScreen(
    uiState: CredentialUiState,
    onVerifyClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        when (uiState) {
            is CredentialUiState.Idle -> {
                Spacer(modifier = Modifier.weight(1f))
                Button(onClick = onVerifyClick) {
                    Text("Verify Credential")
                }
                Spacer(modifier = Modifier.weight(1f))
            }

            is CredentialUiState.Loading -> {
                Spacer(modifier = Modifier.weight(1f))
                CircularProgressIndicator()
                Spacer(modifier = Modifier.height(16.dp))
                Text("Verifying credential...")
                Spacer(modifier = Modifier.weight(1f))
            }

            is CredentialUiState.Success -> {
                CredentialDetail(result = uiState.result, onVerifyClick = onVerifyClick)
            }

            is CredentialUiState.Error -> {
                Spacer(modifier = Modifier.weight(1f))
                Text(
                    text = uiState.message,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyLarge,
                )
                Spacer(modifier = Modifier.height(16.dp))
                Button(onClick = onVerifyClick) {
                    Text("Retry")
                }
                Spacer(modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun CredentialDetail(
    result: CredentialResult,
    onVerifyClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(modifier = Modifier.height(8.dp))

        // Portrait
        result.portraitBitmap?.let { bitmap ->
            Image(
                bitmap = bitmap.asImageBitmap(),
                contentDescription = "Portrait",
                modifier = Modifier
                    .size(120.dp)
                    .clip(CircleShape),
                contentScale = ContentScale.Crop,
            )
            Spacer(modifier = Modifier.height(12.dp))
        }

        // Verification badge
        val badgeColor = if (result.verified) {
            MaterialTheme.colorScheme.primaryContainer
        } else {
            MaterialTheme.colorScheme.errorContainer
        }
        val badgeTextColor = if (result.verified) {
            MaterialTheme.colorScheme.onPrimaryContainer
        } else {
            MaterialTheme.colorScheme.onErrorContainer
        }
        Box(
            modifier = Modifier
                .background(badgeColor, shape = MaterialTheme.shapes.small)
                .padding(horizontal = 12.dp, vertical = 4.dp),
        ) {
            Text(
                text = if (result.verified) "Verified" else "Not Verified",
                color = badgeTextColor,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Claims table
        Card(
            modifier = Modifier.fillMaxWidth(),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Credential Details",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(modifier = Modifier.height(12.dp))

                result.claims.forEachIndexed { index, field ->
                    ClaimRow(field)
                    if (index < result.claims.lastIndex) {
                        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                    }
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                ClaimRow(ClaimField("Format", result.format))
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                ClaimRow(ClaimField("Document Type", result.type))
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Button(onClick = onVerifyClick) {
            Text("Verify Again")
        }

        Spacer(modifier = Modifier.height(16.dp))
    }
}

@Composable
private fun ClaimRow(field: ClaimField) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = field.label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(0.4f),
        )
        Text(
            text = field.value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(0.6f),
        )
    }
}
