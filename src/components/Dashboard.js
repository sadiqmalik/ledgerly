import React, { useEffect, useMemo, useState } from 'react';
import dataAPI, { api } from '../services/dataAPI';
import { useLedger } from '../hooks/LedgerContext';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from './common/format';
import { classifyFunds } from './dashboard/ui';
import { useDashboardLayout } from './dashboard/layout';
import Customize from './dashboard/Customize';
import { useDashboardView } from './dashboard/view';
import Overview from './dashboard/Overview';
import { Funds, Wallets, Memo } from './dashboard/FundSections';
import { ThisYear, ProfitTrend, OpenProjects, Recent, LoansPanel, Attention } from './dashboard/Panels';
import { hasResource } from '../auth/resources.mjs';
import { Accounts } from './dashboard/Accounts';

export default function Dashboard() {
  const { book, can, version } = useLedger();
  const { account } = useAuth();
  const { layout, toggle, move, reset } = useDashboardLayout(account?.id, book.id);
  const [view] = useDashboardView(account?.id); // List, Pie, Bars or Graph: set in Settings > Dashboard
  const [data, setData] = useState(null);
  const [holders, setHolders] = useState({});
  const [error, setError] = useState('');
  const [custom, setCustom] = useState(false);
  const base = book.baseCurrency;

  useEffect(() => {
    let cancelled = false;
    setError('');
    dataAPI.getSummary(book.id)
      .then(d => { if (!cancelled) setData(d); })
      .catch(err => { if (!cancelled) setError(errorMessage(err, 'Could not load the summary.')); });
    return () => { cancelled = true; };
  }, [book.id, version]);

  useEffect(() => {
    let cancelled = false;
    api.get(`/books/${book.id}/holders`)
      .then(r => { if (!cancelled) setHolders(Object.fromEntries((Array.isArray(r.data) ? r.data : []).map(h => [h.id, h.name]))); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [book.id]);

  const groups = useMemo(() => (data ? classifyFunds(data.funds, base) : null), [data, base]);

  const render = id => {
    switch (id) {
      case 'overview': return <Overview data={data} groups={groups} base={base} view={view} />;
      case 'accounts': return <Accounts data={data} view={view} />;
      case 'attention': return <Attention />;
      case 'funds': return <Funds groups={groups} holders={holders} view={view} />;
      case 'loans': return <LoansPanel />;
      case 'wallets': return <Wallets groups={groups} holders={holders} />;
      case 'year': return <ThisYear data={data} view={view} />;
      case 'profit': return <ProfitTrend groups={groups} />;
      case 'projects': return <OpenProjects />;
      case 'recent': return <Recent data={data} />;
      case 'memo': return <Memo groups={groups} />;
      default: return null;
    }
  };
  // Open projects shows project financials, so it needs the Projects page.
  const visible = layout.order.filter(id => !layout.hidden.includes(id) && (id !== 'projects' || can('projects')) && (id !== 'loans' || hasResource(account, 'loans')));

  return (
    <section aria-label={`${book.name} dashboard`} className="flex flex-col gap-4">
      <div className="flex items-center justify-end gap-2">
        <div className="flex gap-2">
          <button type="button" className="btn" aria-expanded={custom} onClick={() => setCustom(c => !c)}>Customize</button>
        </div>
      </div>
      {custom && <Customize layout={layout} toggle={toggle} move={move} reset={reset} onClose={() => setCustom(false)} />}
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {visible.map(id => <React.Fragment key={id}>{render(id)}</React.Fragment>)}
      </div>
    </section>
  );
}
