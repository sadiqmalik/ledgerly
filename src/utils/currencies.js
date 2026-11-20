// Common ISO currencies for selects. Any other 3-letter code can still be typed in.
export const CURRENCY_LIST = [
  ['PKR', 'Pakistani rupee'], ['USD', 'US dollar'], ['EUR', 'Euro'], ['GBP', 'British pound'], ['SEK', 'Swedish krona'],
  ['NOK', 'Norwegian krone'], ['DKK', 'Danish krone'], ['AED', 'UAE dirham'], ['SAR', 'Saudi riyal'], ['QAR', 'Qatari riyal'],
  ['KWD', 'Kuwaiti dinar'], ['OMR', 'Omani rial'], ['BHD', 'Bahraini dinar'], ['TRY', 'Turkish lira'], ['INR', 'Indian rupee'],
  ['CAD', 'Canadian dollar'], ['AUD', 'Australian dollar'], ['CHF', 'Swiss franc'], ['JPY', 'Japanese yen'], ['CNY', 'Chinese yuan'],
  ['MYR', 'Malaysian ringgit'], ['SGD', 'Singapore dollar']
].map(([code, name]) => ({ code, name }));

export const CURRENCIES = CURRENCY_LIST.map(c => c.code);
export const currencyName = code => CURRENCY_LIST.find(c => c.code === code)?.name || '';
export const isCurrencyCode = v => /^[A-Z]{3}$/.test(v || '');
