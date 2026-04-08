package com.trip.flight.credential.viewmodel

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.trip.flight.credential.model.CredentialResult
import com.trip.flight.credential.model.parseCredentialResult
import com.trip.flight.hopae.HopaeCredentialUtils
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

sealed interface CredentialUiState {
    data object Idle : CredentialUiState
    data object Loading : CredentialUiState
    data class Success(val result: CredentialResult) : CredentialUiState
    data class Error(val message: String) : CredentialUiState
}

class CredentialViewModel(application: Application) : AndroidViewModel(application) {

    private val _uiState = MutableStateFlow<CredentialUiState>(CredentialUiState.Idle)
    val uiState: StateFlow<CredentialUiState> = _uiState

    fun verifyCredential(context: Context, expectedOrigins: List<String>) {
        _uiState.value = CredentialUiState.Loading
        viewModelScope.launch {
            try {
                val json = HopaeCredentialUtils.getCredentialDetailsFromWallet(
                    context = context,
                    expectedOrigins = expectedOrigins,
                )
                val result = parseCredentialResult(json)
                _uiState.value = CredentialUiState.Success(result)
            } catch (e: Exception) {
                _uiState.value = CredentialUiState.Error(e.message ?: "Unknown error")
            }
        }
    }
}
