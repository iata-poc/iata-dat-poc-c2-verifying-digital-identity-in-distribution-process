/**
 * Currency conversion utility
 * Converts prices to a target currency (default: USD) using approximate exchange rates.
 * For a production system, replace with a live exchange rate API.
 */

// Approximate rates to USD (updated periodically for demo)
const RATES_TO_USD = {
  USD: 1,
  CAD: 0.70,   // 1 CAD ≈ 0.70 USD
  QAR: 0.27,   // 1 QAR ≈ 0.27 USD
  EUR: 1.08,   // 1 EUR ≈ 1.08 USD
  GBP: 1.26,   // 1 GBP ≈ 1.26 USD
  TRY: 0.031,  // 1 TRY ≈ 0.031 USD
  AED: 0.27,   // 1 AED ≈ 0.27 USD
  SGD: 0.74,   // 1 SGD ≈ 0.74 USD
  CHF: 1.12,   // 1 CHF ≈ 1.12 USD
  BGN: 0.55,   // 1 BGN ≈ 0.55 USD
  INR: 0.012,  // 1 INR ≈ 0.012 USD
};

/**
 * Convert a single price object to USD
 * @param {object} price - { total, currency, baseAmount?, taxes? }
 * @returns {object} Converted price with currency set to 'USD'
 */
export const convertPriceToUSD = (price) => {
  if (!price || !price.currency || price.currency === 'USD') return price;

  const rate = RATES_TO_USD[price.currency];
  if (!rate) {
    console.warn(`[CurrencyConverter] Unknown currency: ${price.currency}, skipping conversion`);
    return price;
  }

  const round2 = (n) => Math.round(n * 100) / 100;

  return {
    ...price,
    total: round2(price.total * rate),
    baseAmount: price.baseAmount != null ? round2(price.baseAmount * rate) : price.baseAmount,
    taxes: price.taxes != null ? round2(price.taxes * rate) : price.taxes,
    originalCurrency: price.currency,
    originalTotal: price.total,
    currency: 'USD',
  };
};

/**
 * Convert all offers in an array to USD pricing
 * @param {Array} offers - Array of parsed offer objects
 * @returns {Array} Offers with USD prices
 */
export const convertOffersToUSD = (offers) => {
  let converted = 0;
  const result = offers.map((offer) => {
    if (offer.price && offer.price.currency !== 'USD') {
      converted++;
      return { ...offer, price: convertPriceToUSD(offer.price) };
    }
    return offer;
  });

  if (converted > 0) {
    console.log(`[CurrencyConverter] Converted ${converted}/${offers.length} offers to USD`);
  }

  return result;
};
