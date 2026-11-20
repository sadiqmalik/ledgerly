import CrudTab from './CrudTab';
import { Field, SideSwitch, inputCls } from './ui';

// Categories have no archived state: a category that an entry uses cannot be deleted (the API returns 409).
export default function CategoriesTab({ bookId, canEdit }) {
  return (
    <CrudTab
      bookId={bookId}
      path="categories"
      label="Category"
      canEdit={canEdit}
      removal="delete"
      countKey="categories"
      countHref={c => `#/ledger?category=${c.id}&year=all`}
      showArchivedToggle={false}
      columns={[
        { key: 'name', label: 'Name', primary: true, cell: c => c.name },
        {
          key: 'parent', label: 'Parent',
          cell: (c, ctx) => ctx.rows.find(p => p.id === c.parentId)?.name || '-',
        },
        { key: 'direction', label: 'Default direction', cell: c => (c.defaultDirection === 'cr' ? 'Credit' : 'Debit') },
      ]}
      blankDraft={() => ({ name: '', parentId: '', defaultDirection: 'dr' })}
      toDraft={c => ({ name: c.name, parentId: c.parentId || '', defaultDirection: c.defaultDirection })}
      toPayload={d => ({ name: d.name.trim(), parentId: d.parentId || null, defaultDirection: d.defaultDirection })}
      renderFields={(d, update, ctx) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input className={inputCls} value={d.name} onChange={e => update({ name: e.target.value })} />
          </Field>
          <Field label="Parent">
            <select className={inputCls} value={d.parentId} onChange={e => update({ parentId: e.target.value })}>
              <option value="">None (top level)</option>
              {ctx.rows
                .filter(c => c.id !== ctx.editingId)
                .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Default direction">
            <SideSwitch label="Credit by default" hint="On: new entries in this category start as credit, money in. Off: they start as debit, money out." offValue="dr" onValue="cr" value={d.defaultDirection} onChange={v => update({ defaultDirection: v })} />
          </Field>
        </div>
      )}
    />
  );
}
