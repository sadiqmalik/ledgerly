import CrudTab from './CrudTab';
import { Field, inputCls } from './ui';

// Parties are the people and businesses entries are with. Editors can change them; viewers only read.
export default function PartiesTab({ bookId, canEdit }) {
  return (
    <CrudTab
      bookId={bookId}
      path="parties"
      label="Person"
      canEdit={canEdit}
      removal="archive"
      countKey="parties"
      countHref={p => `#/ledger?party=${p.id}&year=all`}
      isArchived={p => !!p.archived}
      restoreBody={{ archived: false }}
      columns={[
        { key: 'name', label: 'Name', primary: true, cell: p => p.name },
        { key: 'relation', label: 'Relation', cell: p => p.relation || '-' },
        { key: 'aliases', label: 'Aliases', cell: p => (p.aliases || []).join(', ') || '-' },
      ]}
      blankDraft={() => ({ name: '', relation: '', aliasText: '' })}
      toDraft={p => ({ name: p.name, relation: p.relation || '', aliasText: (p.aliases || []).join(', ') })}
      toPayload={d => ({
        name: d.name.trim(),
        relation: d.relation.trim() || null,
        aliases: d.aliasText.split(',').map(s => s.trim()).filter(Boolean),
      })}
      renderFields={(d, update) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input className={inputCls} value={d.name} onChange={e => update({ name: e.target.value })} />
          </Field>
          <Field label="Relation">
            <input
              className={inputCls}
              value={d.relation}
              placeholder="e.g. family, client, vendor"
              onChange={e => update({ relation: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Aliases (comma-separated)">
              <input
                className={inputCls}
                value={d.aliasText}
                placeholder="e.g. Ali, A. Khan"
                onChange={e => update({ aliasText: e.target.value })}
              />
            </Field>
          </div>
        </div>
      )}
    />
  );
}
