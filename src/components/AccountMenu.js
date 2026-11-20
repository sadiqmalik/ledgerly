import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import NewLedgerModal from './NewLedgerModal';

function AccountMenu() {
  const { account, signOut, changePassword } = useAuth();
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [newLedger, setNewLedger] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [outError, setOutError] = useState('');
  const root = useRef(null);
  const toggleBtn = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = e => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') { setOpen(false); if (toggleBtn.current) toggleBtn.current.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!account) return null;

  const doSignOut = async () => {
    setOutError('');
    try {
      if (!(await signOut())) setOutError('Could not sign out \u2014 check your connection');
    } catch {
      setOutError('Could not sign out \u2014 check your connection');
    }
  };

  const submitPassword = async e => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await changePassword(current, next);
      setMessage('Password changed. Other sessions were signed out.');
      setCurrent('');
      setNext('');
      setChanging(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not change the password.');
    }
  };

  const roleText = account.accessCode ? 'Access code (viewer)' : account.isSuperAdmin ? 'Super administrator' : 'Account';

  return (
    <>
    <div className="account-menu" ref={root}>
      <button
        ref={toggleBtn}
        type="button"
        className="account-toggle"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span className="account-avatar" aria-hidden="true">{(account.name || account.email || '?').charAt(0).toUpperCase()}</span>
        <span className="account-name">{account.name || account.email}</span>
      </button>
      {open && (
        <div className="account-panel" role="menu">
          <div className="account-id">
            <div className="account-title">{account.name}</div>
            {account.email && <div className="account-email">{account.email}</div>}
            <div className="account-role">{roleText}</div>
          </div>
          {!changing ? (
            <>
              {account.isSuperAdmin && (
                <button type="button" className="btn btn-secondary" onClick={() => { setNewLedger(true); setOpen(false); }}>New ledger</button>
              )}
              {!account.accessCode && (
                <button type="button" className="btn btn-secondary" onClick={() => { setChanging(true); setMessage(''); }}>
                  Change password
                </button>
              )}
              <button type="button" className="btn btn-danger" onClick={doSignOut}>Sign out</button>
              {outError && <div className="alert alert-error" role="alert">{outError}</div>}
            </>
          ) : (
            <form onSubmit={submitPassword} className="account-password">
              <label htmlFor="pw-current">Current password</label>
              <input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} required />
              <label htmlFor="pw-next">New password (12+ characters)</label>
              <input id="pw-next" type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} required minLength={12} />
              {error && <div className="alert alert-error" role="alert">{error}</div>}
              <div className="account-actions">
                <button type="submit" className="btn btn-primary">Save</button>
                <button type="button" className="btn btn-secondary" onClick={() => { setChanging(false); setError(''); }}>Cancel</button>
              </div>
            </form>
          )}
          {message && <div className="alert alert-success" role="status">{message}</div>}
        </div>
      )}
    </div>
    {newLedger && <NewLedgerModal onClose={() => setNewLedger(false)} />}
    </>
  );
}

export default AccountMenu;
