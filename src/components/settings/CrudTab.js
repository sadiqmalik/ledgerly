import { useState } from 'react';
import { api } from '../../services/dataAPI';
import { useLedger } from '../../hooks/LedgerContext';
import ConfirmDialog from '../common/ConfirmDialog';
import { useAuth } from '../../auth/AuthContext';
import { hasResource } from '../../auth/resources.mjs';
import { useResource, useEntryCounts, EntryCount, errorText, btnPrimary, btnSecondary, btnDanger, Toggle, Badge } from './ui';
import { useListView } from '../../hooks/useListView';
import Stamp from '../common/Stamp';

// One generic list-and-edit screen. Each settings tab supplies its columns, form fields and payload mapping.
//   removal: 'archive' (DELETE archives, can be restored with restoreBody) or 'delete' (hard delete).
//   isArchived(row): whether a row is archived/inactive. restoreBody: PUT body that brings it back.
//   ctx: extra data for columns and fields. CrudTab adds `rows` (the list) and `editingId`.
export default function CrudTab({
  bookId, path, label, columns, ctx = {}, canEdit,
  blankDraft, toDraft, toPayload, renderFields,
  removal = 'archive', isArchived = () => false, restoreBody = {},
  showArchivedToggle = true, nameOf = r => r.name,
  countKey = null, countHref = null, countNoun = 'entries',
}) {
  const { account } = useAuth();
  const { notifyChanged } = useLedger();
  const base = `/books/${bookId}/${path}`;
  const [status, setStatus] = useState('active'); // active | archived | all
  // Always load archived rows too (when the tab has any), so the switch can show counts and filter without a reload.
  const list = useResource(base, { all: showArchivedToggle });
  const allRows = list.data;
  const counts = useEntryCounts(bookId, countKey, list.loading);
  const canLink = hasResource(account, 'ledger');
  const showCounts = !!counts && !!countKey;
  const countOf = row => (
    <EntryCount n={counts?.[row.id] || 0} noun={countNoun} name={nameOf(row)}
      href={canLink && countHref ? countHref(row, fullCtx) : null} />
  );
  const archivedCount = allRows.filter(isArchived).length;
  const rows = !showArchivedToggle || status === 'all' ? allRows
    : status === 'archived' ? allRows.filter(isArchived) : allRows.filter(r => !isArchived(r));

  const [editing, setEditing] = useState(null); // null | { id: null } | { id, row }
  const [draft, setDraft] = useState(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false); // dialog for Delete/Archive
  const [view, setView] = useListView(); // 'cards' | 'table', shared with every settings list

  const fullCtx = { ...ctx, rows, editingId: editing?.id ?? null };
  const update = patch => setDraft(d => ({ ...d, ...patch }));

  function openNew() {
    setEditing({ id: null });
    setDraft(blankDraft(fullCtx));
    setFormError('');
  }

  function openEdit(row) {
    setEditing({ id: row.id, row });
    setDraft(toDraft(row, fullCtx));
    setFormError('');
  }

  function close() {
    setEditing(null);
    setFormError('');
  }

  async function save(e) {
    e.preventDefault();
    if (!String(draft.name || '').trim()) {
      setFormError('Name is required');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const body = toPayload(draft, fullCtx);
      if (editing.id) await api.put(`${base}/${editing.id}`, body);
      else await api.post(base, body);
      close();
      list.reload();
      notifyChanged();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  // The Delete/Archive button only opens the dialog; the request runs from its confirm button.
  function askRemove() {
    setConfirmRemove(true);
  }

  async function remove() {
    setBusy(true);
    setFormError('');
    try {
      await api.delete(`${base}/${editing.id}`);
      close();
      list.reload();
      notifyChanged();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(false);
      setConfirmRemove(false);
    }
  }

  async function restore() {
    setBusy(true);
    setFormError('');
    try {
      await api.put(`${base}/${editing.id}`, restoreBody);
      close();
      list.reload();
      notifyChanged();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const editingArchived = editing?.row ? isArchived(editing.row) : false;
  const removeName = editing?.row ? nameOf(editing.row) : '';
  const removeMessage = removal === 'delete'
    ? `Delete "${removeName}"? This cannot be undone.`
    : `Disable "${removeName}"? You can enable it again later with the Show disabled switch.`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        {showArchivedToggle && archivedCount > 0 && (
          <Toggle compact label={`Show disabled (${archivedCount})`} checked={status === 'all'} onChange={on => setStatus(on ? 'all' : 'active')} />
        )}
        {canEdit && !editing && (
          <button type="button" onClick={openNew} className={btnPrimary}>Add {label.toLowerCase()}</button>
        )}
      </div>

      {list.error && <p role="alert" className="text-sm text-negative">{list.error}</p>}

      {canEdit && editing && draft && (
        <form onSubmit={save} className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h3 className="text-base font-semibold text-foreground">
            {editing.id ? `Edit ${label.toLowerCase()}` : `New ${label.toLowerCase()}`}
            {editingArchived && <Badge>Disabled</Badge>}
          </h3>
          {renderFields(draft, update, fullCtx)}
          {formError && <p role="alert" className="text-sm text-negative">{formError}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className={btnPrimary}>Save</button>
            <button type="button" onClick={close} disabled={busy} className={btnSecondary}>Cancel</button>
            {editing.id && removal === 'archive' && editingArchived && (
              <button type="button" onClick={restore} disabled={busy} className={btnSecondary}>Enable</button>
            )}
            {editing.id && (
              <button type="button" onClick={askRemove} disabled={busy} className={btnDanger}>
                {removal === 'delete' ? 'Delete' : 'Disable'}
              </button>
            )}
          </div>
        </form>
      )}

      {confirmRemove && editing?.row && (
        <ConfirmDialog
          title={`${removal === 'delete' ? 'Delete' : 'Disable'} ${label.toLowerCase()}?`}
          message={removeMessage}
          confirmLabel={removal === 'delete' ? 'Delete' : 'Disable'}
          tone={removal === 'delete' ? 'danger' : 'default'}
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirmRemove(false)}
        />
      )}

      {view === 'cards' ? (
        <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
          {list.loading && rows.length === 0 && (
            <p className="col-span-full px-1 py-2 text-muted-foreground">Loading...</p>
          )}
          {!list.loading && rows.length === 0 && !list.error && (
            <p className="col-span-full px-1 py-2 text-muted-foreground">{status === 'archived' && showArchivedToggle ? 'Nothing is disabled.' : 'Nothing here yet.'}</p>
          )}
          {rows.map(row => {
            const archived = isArchived(row);
            const primary = columns.find(c => c.primary);
            const details = columns.filter(c => !c.primary);
            return (
              <div
                key={row.id}
                onClick={canEdit ? () => openEdit(row) : undefined}
                className={`rounded-lg border border-border bg-card p-3 text-sm ${canEdit ? 'cursor-pointer hover:bg-muted' : ''} ${archived ? 'text-muted-foreground' : ''}`}
              >
                {primary && (
                  <div className={`flex items-center gap-2.5 ${details.length ? 'mb-2 border-b border-border pb-2' : ''}`}>
                    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold uppercase text-accent">
                      {String(nameOf(row) || '?').trim().charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1 break-words text-base font-semibold leading-tight text-foreground">
                      {canEdit ? (
                        <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left text-base font-semibold text-foreground underline-offset-2 hover:underline">
                          {primary.cell(row, fullCtx)}
                        </button>
                      ) : primary.cell(row, fullCtx)}
                      {archived && <Badge>Disabled</Badge>}
                    </div>
                    {showCounts && <div className="shrink-0 self-start">{countOf(row)}</div>}
                  </div>
                )}
                {details.map(c => {
                  const value = c.cell(row, fullCtx);
                  if (value == null || value === '' || value === '-') return null;
                  return (
                    <div key={c.key} className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
                      <span className="shrink-0 text-muted-foreground">{c.label}</span>
                      <span className="min-w-0 break-words text-right font-medium tabular-nums text-foreground">{value}</span>
                    </div>
                  );
                })}
                <Stamp createdAt={row.createdAt} updatedAt={row.updatedAt} className="mt-1 border-t border-border pt-1 text-xs text-muted-foreground" />
              </div>
            );
          })}
        </div>
      ) : (
      <div className="max-w-full overflow-x-auto rounded-lg border border-border bg-card">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              {columns.map(c => (
                <th key={c.key} scope="col" className={`whitespace-nowrap px-3 py-2 font-medium ${c.right ? 'text-right' : ''}`}>
                  {c.label}
                </th>
              ))}
              {showCounts && <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">Entries</th>}
            </tr>
          </thead>
          <tbody>
            {list.loading && rows.length === 0 && (
              <tr><td colSpan={columns.length + (showCounts ? 1 : 0)} className="px-3 py-4 text-muted-foreground">Loading...</td></tr>
            )}
            {!list.loading && rows.length === 0 && !list.error && (
              <tr><td colSpan={columns.length + (showCounts ? 1 : 0)} className="px-3 py-4 text-muted-foreground">{status === 'archived' && showArchivedToggle ? 'Nothing is disabled.' : 'Nothing here yet.'}</td></tr>
            )}
            {rows.map(row => {
              const archived = isArchived(row);
              return (
                <tr
                  key={row.id}
                  onClick={canEdit ? () => openEdit(row) : undefined}
                  className={`border-t border-border ${canEdit ? 'cursor-pointer hover:bg-muted' : ''} ${archived ? 'text-muted-foreground' : ''}`}
                >
                  {columns.map(c => {
                    const content = c.cell(row, fullCtx);
                    return (
                      <td key={c.key} className={`whitespace-nowrap px-3 py-2 ${c.right ? 'text-right tabular-nums' : ''}`}>
                        {c.primary && canEdit ? (
                          <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left font-medium text-foreground underline-offset-2 hover:underline">
                            {content}
                          </button>
                        ) : content}
                        {c.primary && archived && <Badge>Disabled</Badge>}
                      </td>
                    );
                  })}
                  {showCounts && <td className="whitespace-nowrap px-3 py-2 text-right">{countOf(row)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
