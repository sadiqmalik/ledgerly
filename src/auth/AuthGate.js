import React from 'react';
import { useAuth } from './AuthContext';
import LoginScreen from '../components/LoginScreen';

// Shows the app only to signed-in users. The app itself is unmounted when the session ends,
// and the tab and organization are restored from sessionStorage after signing in again.
function AuthGate({ children }) {
  const { status, notice } = useAuth();
  if (status === 'loading') {
    return <div className="auth-loading">Loading…</div>;
  }
  if (status === 'signedOut') {
    return <LoginScreen notice={notice} />;
  }
  return children;
}

export default AuthGate;
