// config.js
// Central configuration for the application
// Update values here to change app-wide settings

export const config = {
  // Currency symbol used throughout the app
  // Change this to any currency symbol: ₹, $, €, £, ¥, etc.
  CURRENCY: import.meta.env.REACT_APP_CURRENCY || 'USD',

  // API Configuration
  API_URL: import.meta.env.REACT_APP_API_URL || '/api',

  // App Name
  APP_NAME: import.meta.env.REACT_APP_NAME || 'Ledger',
};

export default config;

