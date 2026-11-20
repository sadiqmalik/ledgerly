import { formatMoney, parseMoney } from './money.js';

export const MAX_QUANTITY = 1_000_000_000;
export const MAX_UNIT_PRICE_MINOR = 10_000_000_000_000;
export const MAX_TOTAL_MINOR = 10_000_000_000_000;

const SCALE = 1000n;
const HALF = 500n;
const MAX_QUANTITY_THOUSANDTHS = BigInt(MAX_QUANTITY) * SCALE;
const MAX_TOTAL_MINOR_BIGINT = BigInt(MAX_TOTAL_MINOR);

const quantityRegex = /^\d+(?:\.\d{1,3})?$/;
const thousandsPattern = /^\d{1,3}(?:,\d{3})+(?:\.\d{1,3})?$/;

function validMinor(value) {
  return Number.isInteger(value) && value > 0 && value <= MAX_UNIT_PRICE_MINOR;
}

function parseQuantityThousandths(clean) {
  if (!quantityRegex.test(clean)) return null;
  const [wholeText, fracText = ''] = clean.split('.');
  const frac3 = fracText.padEnd(3, '0');
  return (BigInt(wholeText) * SCALE) + BigInt(frac3 || '0');
}

export function parseQuantityInput(text) {
  if (text == null) return null;
  const raw = String(text).trim();
  if (!raw) return null;
  const clean = raw.includes(',') ? (thousandsPattern.test(raw) ? raw.replace(/,/g, '') : '') : raw;
  if (!clean) return null;
  const thousandths = parseQuantityThousandths(clean);
  if (typeof thousandths !== 'bigint') return null;
  if (thousandths <= 0n || thousandths > MAX_QUANTITY_THOUSANDTHS) return null;
  return {
    value: Number(thousandths) / 1000,
    thousandths,
  };
}

export function parseQuantityNumber(value) {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_QUANTITY) return null;
  const thousandths = parseQuantityThousandths(String(value));
  if (typeof thousandths !== 'bigint') return null;
  if (thousandths <= 0n || thousandths > MAX_QUANTITY_THOUSANDTHS) return null;
  return { value: Number(thousandths) / 1000, thousandths };
}

export function parseUnitPriceInput(text) {
  const minor = parseMoney(text);
  return validMinor(minor) ? minor : null;
}

export function amountMinorFromQuantityAndUnitPrice(quantityThousandths, unitPriceMinor) {
  if (typeof quantityThousandths !== 'bigint' || quantityThousandths <= 0n || quantityThousandths > MAX_QUANTITY_THOUSANDTHS) return null;
  if (!validMinor(unitPriceMinor)) return null;
  const total = ((quantityThousandths * BigInt(unitPriceMinor)) + HALF) / SCALE;
  if (total <= 0n || total > MAX_TOTAL_MINOR_BIGINT) return null;
  return Number(total);
}

export function formatQuantityThousandths(thousandths) {
  if (typeof thousandths !== 'bigint' || thousandths <= 0n) return '';
  const whole = thousandths / SCALE;
  const frac = thousandths % SCALE;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(3, '0').replace(/0+$/, '')}`;
}

export function formatQuantity(value) {
  const parsed = typeof value === 'string' ? parseQuantityInput(value) : parseQuantityNumber(value);
  return parsed ? formatQuantityThousandths(parsed.thousandths) : '';
}

export function formatUnitPriceInput(minor) {
  return validMinor(minor) ? formatMoney(minor).replace(/,/g, '') : '';
}

export function validateQuantityPriceInputs(quantityText, unitPriceText) {
  const quantity = parseQuantityInput(quantityText);
  if (!quantity) return { error: `Enter a quantity greater than zero, with up to 3 decimal places (max ${MAX_QUANTITY.toLocaleString('en-US')}).` };
  const unitPrice = parseUnitPriceInput(unitPriceText);
  if (unitPrice == null) return { error: `Enter a valid unit price greater than zero (max ${formatMoney(MAX_UNIT_PRICE_MINOR)}).` };
  const amount = amountMinorFromQuantityAndUnitPrice(quantity.thousandths, unitPrice);
  if (amount == null) return { error: `Total must be greater than zero and at most ${formatMoney(MAX_TOTAL_MINOR)}.` };
  return { quantity: quantity.value, quantityThousandths: quantity.thousandths, unitPrice, amount };
}

export function quantityPriceFromEntry(entry = {}) {
  const quantity = parseQuantityNumber(entry.quantity) || parseQuantityNumber(1);
  const fallbackAmount = Number.isInteger(entry.amount) && entry.amount > 0 ? entry.amount : null;
  let unitPrice = validMinor(entry.unitPrice) ? entry.unitPrice : fallbackAmount;
  if (!validMinor(unitPrice)) unitPrice = null;
  const amount = unitPrice == null ? fallbackAmount : (amountMinorFromQuantityAndUnitPrice(quantity.thousandths, unitPrice) ?? fallbackAmount);
  return {
    quantity: quantity.value,
    quantityThousandths: quantity.thousandths,
    quantityText: formatQuantityThousandths(quantity.thousandths),
    unitPrice,
    unitPriceText: unitPrice == null ? '' : formatUnitPriceInput(unitPrice),
    amount,
    amountText: amount == null ? '' : formatMoney(amount),
    unitPriceLabel: unitPrice == null ? '' : formatMoney(unitPrice),
  };
}
