import { useAuth } from '../../auth/AuthContext';
import { useDashboardView, VIEWS } from '../dashboard/view';

// Tiny previews drawn with the theme colours only.
const PREVIEWS = {
  list: (
    <g stroke="var(--muted-foreground)" strokeWidth="3" strokeLinecap="round">
      <path d="M8 12h44M8 24h44M8 36h44" /><path d="M58 12h14M58 24h14M58 36h14" opacity="0.5" />
    </g>
  ),
  pie: (
    <g>
      <circle cx="40" cy="24" r="17" fill="var(--cur-1)" />
      <path d="M40 24V7a17 17 0 0 1 16.2 11.8z" fill="var(--cur-2)" />
      <path d="M40 24l16.2-5.2A17 17 0 0 1 52 37z" fill="var(--cur-3)" />
    </g>
  ),
  bars: (
    <g strokeLinecap="round" strokeWidth="6">
      <path d="M10 12h58" stroke="var(--cur-1)" /><path d="M10 24h40" stroke="var(--cur-2)" /><path d="M10 36h24" stroke="var(--cur-3)" />
    </g>
  ),
  graph: (
    <g fill="var(--cur-1)">
      <rect x="12" y="14" width="12" height="26" rx="3" /><rect x="34" y="6" width="12" height="34" rx="3" fill="var(--cur-2)" /><rect x="56" y="24" width="12" height="16" rx="3" fill="var(--cur-3)" />
    </g>
  )
};

// How the Dashboard shows its amounts. A personal display preference: saved in this browser for this account, and the
// Dashboard follows it straight away.
export default function DashboardTab() {
  const { account } = useAuth();
  const [view, setView] = useDashboardView(account?.id);
  return (
    <div className="max-w-4xl">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-medium">Dashboard visuals</h3>
        <p className="mt-1 text-sm text-muted-foreground">Choose how the Dashboard shows the Overview, Usable and Reserved funds, Accounts and This year.</p>
        <div role="radiogroup" aria-label="Dashboard visuals" className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {VIEWS.map(v => {
            const on = view === v.key;
            return (
              <button key={v.key} type="button" role="radio" aria-checked={on} onClick={() => setView(v.key)}
                className={`flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? 'border-accent bg-accent/10' : 'border-border bg-background hover:bg-muted'}`}>
                <svg viewBox="0 0 80 48" className="h-16 w-full rounded-md bg-card" aria-hidden="true">{PREVIEWS[v.key]}</svg>
                <span className="flex w-full items-center justify-between gap-2 text-sm font-medium">{v.label}{on && <span className="text-xs font-normal text-accent">Selected</span>}</span>
                <span className="text-xs text-muted-foreground">{v.hint}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Saved in this browser for your account. Show, hide and reorder the Dashboard sections with Customize on the Dashboard.</p>
      </div>
    </div>
  );
}
