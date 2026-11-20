// theme.js
// Light/dark theme switching. Toggles the `dark` class on <html>, which
// activates the dark token values in src/styles/tokens.css.

const STORAGE_KEY = 'ledger-theme';

const readStoredTheme = () => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
};

const systemTheme = () =>
  window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';

export const setTheme = (mode) => {
  const resolved = mode === 'dark' ? 'dark' : 'light';
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  try {
    window.localStorage.setItem(STORAGE_KEY, resolved);
  } catch {
    // Storage unavailable (private mode, blocked site data): theme still applies for this page load.
  }
  return resolved;
};

export const initTheme = () => {
  const mode = readStoredTheme() || systemTheme();
  document.documentElement.classList.toggle('dark', mode === 'dark');
  return mode;
};

// Colour palettes: a `data-palette` attribute on <html> overrides the accent and surface tokens (see tokens.css).
// "forest" is the default and sets no attribute.
const PALETTE_KEY = 'ledger-palette';
export const PALETTES = [
  { key: 'forest', label: 'Forest', swatch: '#2f5d50' },
  { key: 'ocean', label: 'Ocean', swatch: '#1f5f8b' },
  { key: 'indigo', label: 'Indigo', swatch: '#4a4fb3' },
  { key: 'plum', label: 'Plum', swatch: '#7a3b7a' },
  { key: 'rose', label: 'Rose', swatch: '#b0405f' },
  { key: 'terracotta', label: 'Terracotta', swatch: '#b55a30' },
  { key: 'slate', label: 'Slate', swatch: '#475569' },
  { key: 'sky', label: 'Sky', swatch: '#4aa3df' },
  { key: 'mint', label: 'Mint', swatch: '#3fb58f' },
  { key: 'lavender', label: 'Lavender', swatch: '#9a82e0' },
  { key: 'coral', label: 'Coral', swatch: '#ec7c62' },
  { key: 'sunshine', label: 'Sunshine', swatch: '#e6b422' },
  { key: 'blush', label: 'Blush', swatch: '#e68aa6' }
];

const isPalette = key => PALETTES.some(p => p.key === key);
const DEFAULT_PALETTE = 'forest';
const DEFAULT_PALETTE_KEY = 'ledger.default.palette';
const personalPaletteKey = accountId => `ledger.pref.palette.${accountId}`;

const readKey = key => {
  try { return window.localStorage.getItem(key); } catch { return null; }
};
const writeKey = (key, value) => {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch { /* applies for this page load only */ }
};

// The palette applied last (the effective value). Used for the first paint at boot.
export const getPalette = () => {
  const stored = readKey(PALETTE_KEY);
  return isPalette(stored) ? stored : DEFAULT_PALETTE;
};

// Sets the attribute and the last-applied cache only.
export const applyPalette = (key) => {
  const resolved = isPalette(key) ? key : DEFAULT_PALETTE;
  if (resolved === DEFAULT_PALETTE) document.documentElement.removeAttribute('data-palette');
  else document.documentElement.setAttribute('data-palette', resolved);
  writeKey(PALETTE_KEY, resolved);
  return resolved;
};

// Ledger default (set by an administrator) cached in this browser; null when unknown.
export const getDefaultPalette = () => {
  const stored = readKey(DEFAULT_PALETTE_KEY);
  return isPalette(stored) ? stored : null;
};
export const storeDefaultPalette = key => { if (isPalette(key)) writeKey(DEFAULT_PALETTE_KEY, key); };

// Personal override for one account; null when the user has not chosen their own.
export const getPersonalPalette = accountId => {
  if (accountId == null) return null;
  const stored = readKey(personalPaletteKey(accountId));
  return isPalette(stored) ? stored : null;
};
export const storePersonalPalette = (accountId, key) => {
  if (accountId == null) return;
  writeKey(personalPaletteKey(accountId), isPalette(key) ? key : null);
};

// Personal override ?? ledger default ?? forest.
export const getEffectivePalette = accountId =>
  getPersonalPalette(accountId) || getDefaultPalette() || DEFAULT_PALETTE;

export const applyEffectivePalette = accountId => applyPalette(getEffectivePalette(accountId));

export const initPalette = () => applyPalette(getPalette());
