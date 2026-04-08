package com.trip.flight.credential

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import com.trip.flight.credential.ui.CredentialScreen
import com.trip.flight.credential.ui.theme.TripDigitalCredentialTheme
import com.trip.flight.credential.viewmodel.CredentialViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            TripDigitalCredentialTheme {
                val viewModel: CredentialViewModel = viewModel()
                val uiState by viewModel.uiState.collectAsState()
                val context = LocalContext.current

                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    CredentialScreen(
                        uiState = uiState,
                        onVerifyClick = {
                            viewModel.verifyCredential(
                                context = context,
                                expectedOrigins = listOf("https://iata-poc.dev.hopae.app"),
                            )
                        },
                        modifier = Modifier.padding(innerPadding),
                    )
                }
            }
        }
    }
}
