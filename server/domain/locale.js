// Install-wide defaults that depend on where the app is used. They come from the environment
// (wrangler [vars], or .dev.vars locally), never from code: DEFAULT_CURRENCY is a 3-letter ISO code.
// Existing data is never affected: books, funds, holders and registers store their own currency.
const FALLBACK_CURRENCY = 'USD';
let currency = FALLBACK_CURRENCY;

const configureLocale = (env = {}) => {
  const code = String((env && env.DEFAULT_CURRENCY) || '').trim().toUpperCase();
  currency = /^[A-Z]{3}$/.test(code) ? code : FALLBACK_CURRENCY;
};
const defaultCurrency = () => currency;

module.exports = { configureLocale, defaultCurrency, FALLBACK_CURRENCY };
