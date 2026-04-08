package com.trip.flight.hopae.services

/** Exception thrown when a server request fails. */
class ServerRequestException(message: String, cause: Throwable? = null) : Exception(message, cause)
