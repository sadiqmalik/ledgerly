const { ValidationError } = require('../errors');

const MAX_MINOR = 1e13;
const validQuantity = quantity => typeof quantity === 'number' && quantity > 0 && quantity <= 1e9
  && /^\d+(?:\.\d{1,3})?$/.test(String(quantity));

const entryTotal = (quantity, unitPrice) => {
  if (!validQuantity(quantity)) throw new ValidationError('quantity must be positive with at most 3 decimal places (maximum 1000000000)');
  if (!Number.isSafeInteger(unitPrice) || unitPrice <= 0 || unitPrice > MAX_MINOR) {
    throw new ValidationError('unitPrice must be a positive integer in minor units (maximum 10000000000000)');
  }
  const [whole, fraction = ''] = String(quantity).split('.');
  const scaled = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  const total = (scaled * BigInt(unitPrice) + 500n) / 1000n;
  if (total <= 0n || total > BigInt(MAX_MINOR)) throw new ValidationError('Calculated amount must be positive and no more than 10000000000000 minor units');
  return Number(total);
};

// Old amount-only clients and workbook imports remain single-unit entries.
const entryPricing = (body, old = null) => {
  const quantity = body.quantity ?? old?.quantity ?? 1;
  let unitPrice = body.unitPrice ?? old?.unit_price ?? old?.amount;
  const priced = body.quantity !== undefined || body.unitPrice !== undefined;
  if (!priced && body.amount !== undefined && quantity === 1) unitPrice = body.amount;
  const amount = entryTotal(quantity, unitPrice);
  if (body.amount !== undefined && body.amount !== amount) {
    throw new ValidationError('amount must equal quantity multiplied by unitPrice; change quantity or unitPrice to update the total');
  }
  return { quantity, unitPrice, amount };
};

module.exports = { MAX_MINOR, validQuantity, entryTotal, entryPricing };
