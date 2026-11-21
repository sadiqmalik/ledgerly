import React, { useState } from 'react';
import Yearly from './Yearly';
import Pivot from './Pivot';
import Profit from './Profit';
import Medical from './Medical';
import { PALETTE_CSS } from './shared';
import usePageName from '../../utils/pageNames';

const TABS = [
  ['yearly', 'Yearly', Yearly],
  ['pivot', 'Spending by', Pivot],
  ['profit', 'Profit', Profit],
  ['medical', 'Medical', Medical]
];

export default function Reports() {
  const pageName = usePageName();
  const [tab, setTab] = useState('yearly');
  const Active = TABS.find(t => t[0] === tab)[2];
  return (
    <section className="rpt w-full min-w-0 space-y-5" aria-label="Reports">
      <style>{PALETTE_CSS}</style>
      <div><h2 className="text-xl font-semibold text-foreground">{pageName('reports')}</h2><p className="text-sm text-muted-foreground">Yearly balances, spending, profit and medical totals. Hover or click a bar for the figures.</p></div>
      <div role="tablist" aria-label="Report sections" className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${tab === k ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {label}
          </button>
        ))}
      </div>
      <Active />
    </section>
  );
}
