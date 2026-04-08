/**
 * Airline code to display name mapping
 */
const AIRLINE_NAMES = {
  AC: 'Air Canada',
  BA: 'British Airways',
  TK: 'Turkish Airlines',
  QR: 'Qatar Airways',
};

/**
 * Airline code to logo path mapping
 */
const AIRLINE_LOGOS = {
  AC: '/airlines/air_canada_logo.png',
  BA: '/airlines/britishAirways.png',
  TK: '/airlines/turkish_airlines_logo.png',
  QR: '/airlines/qatar.png',
};

/**
 * Get airline display name from code
 */
export const getAirlineName = (code) => AIRLINE_NAMES[code] || code;

/**
 * Get airline logo path from code
 */
export const getAirlineLogo = (code) => AIRLINE_LOGOS[code] || '/airlines/default.png';

/**
 * Parse ISO 8601 duration (e.g., 'PT8H5M') to display string (e.g., '8h 05m')
 */
export const formatDuration = (isoDuration) => {
  if (!isoDuration) return '';
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return isoDuration;
  const hours = match[1] || '0';
  const minutes = (match[2] || '0').padStart(2, '0');
  return `${hours}h ${minutes}m`;
};

/**
 * Parse ISO datetime string to time display (e.g., '11:15')
 */
export const formatTime = (isoDateTime) => {
  if (!isoDateTime) return '';
  // Handle both full ISO datetime and time-only strings
  const date = new Date(isoDateTime);
  if (!isNaN(date.getTime())) {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  // Fallback: extract HH:MM from string like "2025-06-15T11:15:00"
  const timeMatch = isoDateTime.match(/T?(\d{2}:\d{2})/);
  return timeMatch ? timeMatch[1] : isoDateTime;
};

/**
 * Format price for display (e.g., 1016.00 -> '1,016.00')
 */
export const formatPrice = (amount, currency) => {
  if (amount == null) return '';
  const formatted = Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${formatted} ${currency}` : formatted;
};

/**
 * Get the cheapest fare option price from a flight's fare options
 */
export const getCheapestPrice = (fareOptions) => {
  if (!fareOptions || fareOptions.length === 0) return null;
  return fareOptions.reduce((min, opt) =>
    opt.price.total < min.price.total ? opt : min
  );
};

/**
 * Group fare options by cabin class name
 * Returns map: { "ECONOMY": fareOption, "PREMIUM ECONOMY": fareOption, "BUSINESS": fareOption }
 * Picks cheapest per cabin when multiple brands exist in same cabin
 */
export const groupFaresByCabin = (fareOptions) => {
  const groups = {};
  for (const opt of fareOptions) {
    const cabin = (opt.fareDetails?.cabinName || 'Economy').toUpperCase();
    if (!groups[cabin] || opt.price.total < groups[cabin].price.total) {
      groups[cabin] = opt;
    }
  }
  return groups;
};

/**
 * Compute total travel time between first departure and last arrival of a segment list.
 * Returns a display string like '8h 05m', or '' if times are missing.
 */
export const computeTotalTravelTime = (firstSegment, lastSegment) => {
  if (!firstSegment?.departureTime || !lastSegment?.arrivalTime) return '';
  const dep = new Date(firstSegment.departureTime);
  const arr = new Date(lastSegment.arrivalTime);
  if (isNaN(dep.getTime()) || isNaN(arr.getTime())) return '';
  const diffMs = arr - dep;
  if (diffMs <= 0) return '';
  const totalMinutes = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}h ${minutes}m`;
};

/**
 * Display-friendly cabin name
 */
const CABIN_DISPLAY = {
  'ECONOMY': 'Economy Class',
  'PREMIUM_ECONOMY': 'Premium Economy',
  'PREMIUM ECONOMY': 'Premium Economy',
  'BUSINESS': 'Business Class',
  'FIRST': 'First Class',
};

export const formatCabinName = (cabinName) => {
  if (!cabinName) return 'Economy Class';
  return CABIN_DISPLAY[cabinName.toUpperCase()] || cabinName;
};
