export const sessionStates = { REQUESTED: 'REQUESTED', VERIFIED: 'VERIFIED' };
export const verifiers = { HOPAE: 'HOPAE' };
export const flows = {
  AGENCY_DESKTOP: { type: 'agency_desktop', verifier: verifiers.HOPAE },
};

// NDC Airline Codes
export const airlines = {
  TK: 'TK',
  BA: 'BA',
  QR: 'QR',
  AC: 'AC',
};

// NDC Order Statuses
export const orderStatuses = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
};

// NDC Passenger Types (PADIS codes)
export const passengerTypes = {
  ADT: { code: 'ADT', name: 'Adult' },
  CHD: { code: 'CHD', name: 'Child' },
  INF: { code: 'INF', name: 'Infant' },
};

// NDC Cabin Types (PADIS codes)
export const cabinTypes = {
  ECONOMY: 'Y',
  PREMIUM_ECONOMY: 'W',
  BUSINESS: 'C',
  FIRST: 'F',
};

// Document Types
export const documentTypes = {
  PASSPORT: 'PASSPORT',
  ID_CARD: 'ID_CARD',
  DRIVERS_LICENSE: 'DRIVERS_LICENSE',
};

// Trip Types
export const tripTypes = {
  ONE_WAY: 'ONE_WAY',
  ROUND_TRIP: 'ROUND_TRIP',
};

export const constants = {
  flows,
  verifiers,
  sessionStates,
  airlines,
  orderStatuses,
  passengerTypes,
  cabinTypes,
  documentTypes,
  tripTypes,
};
