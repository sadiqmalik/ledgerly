import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import './styles/tailwind.css';
import './index.css';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import AuthGate from './auth/AuthGate';
import { CurrencyProvider } from './hooks/CurrencyContext';
import { initTheme, initPalette } from './theme';

initTheme();
initPalette();

// Shown only on local addresses (Warden's *.test or localhost), so a local tab is easy to tell from the live one.
// Checked at runtime: Warden builds with NODE_ENV=development, so import.meta.env.DEV is true in deployed builds too.
const isLocal = /(\.test|^localhost|^127\.0\.0\.1)$/.test(window.location.hostname);
const LocalWatermark = () => (
  <div
    aria-hidden="true"
    style={{
      position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none',
      display: 'grid', placeItems: 'center', overflow: 'hidden'
    }}
  >
    <span
      style={{
        transform: 'rotate(-30deg)', fontSize: 'clamp(4rem, 18vw, 14rem)', fontWeight: 800,
        letterSpacing: '0.1em', color: 'var(--negative)', opacity: 0.14, whiteSpace: 'nowrap', userSelect: 'none'
      }}
    >
      LOCAL
    </span>
  </div>
);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isLocal && <LocalWatermark />}
    <AuthProvider>
      <AuthGate>
        <CurrencyProvider>
          <App />
        </CurrencyProvider>
      </AuthGate>
    </AuthProvider>
  </React.StrictMode>
);
