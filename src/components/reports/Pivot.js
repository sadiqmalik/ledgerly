import React, { useState } from 'react';
import { useLedger } from '../../hooks/LedgerContext';
import PivotView from './PivotView';
import { useGet, Status, Field, ctl, Segmented } from './shared';

const THIS_YEAR = new Date().getFullYear();

export function YearRange({ from, to, setFrom, setTo }) {
  const years = [];
  for (let y = THIS_YEAR; y >= THIS_YEAR - 30; y--) years.push(y);
  return (
    <>
      <Field label="From"><select style={ctl} value={from} onChange={e => setFrom(Number(e.target.value))}>{years.map(y => <option key={y}>{y}</option>)}</select></Field>
      <Field label="To"><select style={ctl} value={to} onChange={e => setTo(Number(e.target.value))}>{years.map(y => <option key={y}>{y}</option>)}</select></Field>
    </>
  );
}

export default function Pivot() {
  const { book } = useLedger();
  const [rows, setRows] = useState('category');
  const [direction, setDirection] = useState('dr');
  const [from, setFrom] = useState(THIS_YEAR - 4);
  const [to, setTo] = useState(THIS_YEAR);
  const [memo, setMemo] = useState(true);
  const state = useGet(`/books/${book.id}/reports/pivot`, { rows, direction, from, to, memo: memo ? 1 : 0 });
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
        <Field label="Rows">
          <Segmented label="Rows" value={rows} onChange={setRows} options={[['category', 'Category'], ['party', 'Person'], ['project', 'Project'], ['fund', 'Fund']]} />
        </Field>
        <Field label="Show">
          <Segmented label="Direction" value={direction} onChange={setDirection} options={[['dr', 'Spent'], ['cr', 'Received'], ['net', 'Net']]} />
        </Field>
        <YearRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <label className="text-sm" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', minHeight: 34 }}>
          <input type="checkbox" checked={memo} onChange={e => setMemo(e.target.checked)} /> Include memo
        </label>
      </div>
      <Status state={state}>{pivot => <PivotView pivot={pivot} title="Per year, top 6 plus Other" />}</Status>
    </div>
  );
}
