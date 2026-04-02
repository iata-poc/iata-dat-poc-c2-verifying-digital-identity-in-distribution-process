package com.trip.flight.hopae.wallet

/**
 * Digital ID type error
 */
class UnexpectedCredentialException(
    message: String,
) : IllegalStateException(message)
