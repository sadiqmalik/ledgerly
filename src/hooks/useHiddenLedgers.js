import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { readLocal, writeLocal } from '../components/common/format';
import { hiddenKey, parseHidden, toggleHidden } from '../utils/hiddenLedgers.mjs';

const EVENT = 'ledger:hidden-changed';

// The ledgers this person hid from the sidebar switcher (per account, this browser). All users of the hook stay in sync.
export default function useHiddenLedgers() {
  const { account } = useAuth();
  const key = hiddenKey(account?.id);
  const [hidden, setHidden] = useState(() => parseHidden(readLocal(key)));
  useEffect(() => {
    const sync = () => setHidden(parseHidden(readLocal(key)));
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [key]);
  const toggle = useCallback(id => {
    writeLocal(key, JSON.stringify(toggleHidden(parseHidden(readLocal(key)), id)));
    window.dispatchEvent(new Event(EVENT));
  }, [key]);
  return { hidden, toggle };
}
