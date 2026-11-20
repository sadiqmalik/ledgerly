// Defaults seeded into every new book. The first 17 categories are the same as migration 0003.
const DEFAULT_CATEGORIES = [
  ['Opening', 'cr'], ['Remittance', 'cr'], ['Profit', 'cr'], ['Transfer', 'dr'], ['Conversion', 'dr'],
  ['Gift', 'dr'], ['Medical', 'dr'], ['Education', 'dr'], ['Travel', 'dr'], ['Food', 'dr'],
  ['Shopping', 'dr'], ['Funeral', 'dr'], ['Donations', 'dr'], ['Investment', 'dr'], ['Household', 'dr'],
  ['Inheritance', 'cr'], ['Other', 'dr'],
  ['Family support', 'dr'], ['Cash withdrawal', 'dr'], ['Charity', 'dr']
].map(([name, defaultDirection]) => ({ name, defaultDirection }));

const DEFAULT_FUND = { name: 'General', kind: 'general', isReserved: false };
const DEFAULT_HOLDER = { name: 'Cash', kind: 'cash' };

module.exports = { DEFAULT_CATEGORIES, DEFAULT_FUND, DEFAULT_HOLDER };
