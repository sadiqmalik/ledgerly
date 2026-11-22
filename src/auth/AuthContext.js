import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clearDefaultApplied } from '../utils/defaultLedger';
import dataAPI from '../services/dataAPI';

const AuthContext = createContext(null);

export const SESSION_ENDED = 'Your session has ended. Sign in to continue.';

// status: 'loading' | 'signedIn' | 'signedOut'. `notice` explains why the sign-in screen is shown.
export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [account, setAccount] = useState(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    dataAPI.getMe()
      .then(me => {
        if (cancelled) return;
        setAccount(me);
        setStatus('signedIn');
      })
      .catch(() => {
        if (cancelled) return;
        setAccount(null);
        setStatus('signedOut');
      });
    return () => { cancelled = true; };
  }, []);

  // Any request that comes back 401 (not from the sign-in routes) ends the session.
  useEffect(() => {
    const onUnauthorized = () => {
      setAccount(null);
      setNotice(SESSION_ENDED);
      setStatus('signedOut');
    };
    window.addEventListener('ledger:unauthorized', onUnauthorized);
    return () => window.removeEventListener('ledger:unauthorized', onUnauthorized);
  }, []);

  // Re-reads /auth/me so page and role changes made by an administrator show up without signing in again.
  // 401 ends the session through the interceptor; other failures are logged and the current account is kept.
  useEffect(() => {
    if (status !== 'signedIn') return undefined;
    let cancelled = false;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const me = await dataAPI.getMe();
        if (cancelled) return;
        setAccount(prev => (JSON.stringify(prev) === JSON.stringify(me) ? prev : me));
      } catch (err) {
        if (err?.response?.status !== 401) console.error('Could not refresh the account', err);
        else if (!cancelled) window.dispatchEvent(new Event('ledger:unauthorized'));
      } finally {
        inFlight = false;
      }
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('ledger:forbidden', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('ledger:forbidden', refresh);
    };
  }, [status]);

  const signIn = useCallback(async (email, password) => {
    const me = await dataAPI.login(email, password);
    setAccount(me);
    setNotice('');
    setStatus('signedIn');
  }, []);

  const signInWithCode = useCallback(async code => {
    const me = await dataAPI.loginWithCode(code);
    setAccount(me);
    setNotice('');
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    // Returns false (and stays signed in) when the server could not be reached.
    try {
      await dataAPI.logout();
      clearDefaultApplied();
    } catch (err) {
      if (err?.response?.status !== 401) return false; // 401 means the session is already gone
    }
    // A deliberate sign-out forgets where the user was, so the next person starts fresh.
    try { sessionStorage.removeItem('ledger.tab'); sessionStorage.removeItem('ledger.book'); } catch { /* storage unavailable */ }
    try { localStorage.removeItem('ledger.book'); } catch { /* storage unavailable */ }
    setAccount(null);
    setNotice('');
    setStatus('signedOut');
    return true;
  }, []);

  const changePassword = useCallback(async (current, next) => {
    await dataAPI.changePassword(current, next);
  }, []);

  const value = useMemo(
    () => ({ status, account, notice, signIn, signInWithCode, signOut, changePassword }),
    [status, account, notice, signIn, signInWithCode, signOut, changePassword]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
