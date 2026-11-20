import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';

function LoginScreen({ notice }) {
  const { signIn, signInWithCode } = useAuth();
  const [mode, setMode] = useState('code');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'code') await signInWithCode(code);
      else await signIn(email, password);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not sign in. Check your connection and try again.');
      if (mode === 'code') setCode('');
      else setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card card" onSubmit={submit} aria-labelledby="login-title">
        <div className="login-brand" aria-hidden="true">L</div>
        <h1 id="login-title">Sign in</h1>
        <p className="login-sub">Ledger</p>
        {notice && <div className="alert alert-error" role="status">{notice}</div>}
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {mode === 'code' ? (
          <div className="form-group">
            <label htmlFor="login-code">Access code</label>
            <input
              id="login-code"
              type="password"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={code}
              onChange={e => setCode(e.target.value)}
              required
              autoFocus
            />
          </div>
        ) : (
          <>
        <div className="form-group">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="form-group">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>
          </>
        )}
        <button className="btn btn-primary login-submit" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <button
          type="button"
          className="btn btn-link login-switch"
          onClick={() => { setMode(mode === 'code' ? 'password' : 'code'); setError(''); }}
        >
          {mode === 'code' ? 'Sign in with email and password' : 'Use an access code instead'}
        </button>
      </form>
    </div>
  );
}

export default LoginScreen;
