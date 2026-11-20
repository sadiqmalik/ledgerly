import { useEffect } from 'react';
import { api } from '../../services/dataAPI';
import { useAuth } from '../../auth/AuthContext';
import { applyEffectivePalette, storeDefaultPalette } from '../../theme';
import { applyEffectiveListView, storeDefaultListView } from '../../hooks/useListView';

// Fetches the ledger default palette and list layout (set by an administrator), caches it, then applies the effective look:
// the user's personal choice if they made one, otherwise the ledger default. Renders nothing.
// If the request fails, the locally cached look stays in place.
export default function AppearanceSync({ bookId }) {
  const { account } = useAuth();
  const accountId = account?.id;

  useEffect(() => {
    if (!bookId) return undefined;
    let cancelled = false;
    // Apply what is cached for this account straight away (personal choice may differ from the boot value).
    applyEffectivePalette(accountId);
    applyEffectiveListView(accountId);
    (async () => {
      try {
        const { data } = await api.get(`/books/${bookId}/appearance`);
        if (cancelled || !data) return;
        if (data.palette) storeDefaultPalette(data.palette);
        if (data.listView) storeDefaultListView(data.listView);
        applyEffectivePalette(accountId);
        applyEffectiveListView(accountId);
      } catch {
        // Keep the cached look.
      }
    })();
    return () => { cancelled = true; };
  }, [bookId, accountId]);

  return null;
}
