import React, { useEffect, useState } from 'react';
import {
  Database,
  ServerCog,
  Network,
  Lock,
  Activity,
  ShieldCheck,
} from 'lucide-react';
import {
  API_BASE_URL,
  API_CONFIGURED,
  FEATURES,
  checkApiHealth,
  type HealthReport,
} from '@/lib/api';

/**
 * "Biodiversity Intelligence Infrastructure"
 *
 * The architectural narrative for the homepage: the Continuum is an
 * API-first platform — frontend never touches the database, modules are
 * feature-flagged, and every signal is traceable. This section also
 * exposes a live `/health` probe so visitors see whether the backend is
 * online for this deployment.
 */
const PILLARS = [
  {
    icon: Database,
    label: 'A trusted scientific core',
    body: 'Verified orchid names, profiles, and ecological signals are served through a single versioned scientific API — the public site never reaches into the underlying records directly.',
  },
  {
    icon: Network,
    label: 'Composable modules',
    body: 'Atlas, Species, Interactions, Zoo, and OACS are independently deployable, feature-flagged, and embeddable as widgets.',
  },
  {
    icon: ServerCog,
    label: 'Provenance everywhere',
    body: 'Every entry carries source, license, and last-updated timestamps so researchers can cite responsibly and learners can trust what they read.',
  },
  {
    icon: Lock,
    label: 'Zero credentials in the browser',
    body: 'No service keys, no shared passwords. The website is configured by a single secure API endpoint — nothing more.',
  },
];

const StatusPill: React.FC<{ report: HealthReport | null }> = ({ report }) => {
  const statusKey = report?.status ?? 'checking';
  const palette: Record<string, string> = {
    online: 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200',
    offline: 'border-amber-300/40 bg-amber-300/10 text-amber-200',
    unconfigured: 'border-white/20 bg-white/5 text-white/65',
    checking: 'border-white/20 bg-white/5 text-white/55',
  };
  const dot: Record<string, string> = {
    online: 'bg-emerald-300 animate-pulse',
    offline: 'bg-amber-300',
    unconfigured: 'bg-white/40',
    checking: 'bg-white/40 animate-pulse',
  };
  const label: Record<string, string> = {
    online: 'API online',
    offline: 'API refreshing',
    unconfigured: 'Demo mode',
    checking: 'Probing /health…',
  };
  return (
    <span
      className={
        'inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[11px] tracking-[0.18em] uppercase ' +
        palette[statusKey]
      }
    >
      <span className={'w-1.5 h-1.5 rounded-full ' + dot[statusKey]} />
      {label[statusKey]}
      {report?.latencyMs != null && (
        <span className="text-white/50 normal-case tracking-normal">
          {report.latencyMs}ms
        </span>
      )}
    </span>
  );
};

const BiodiversityInfrastructure: React.FC = () => {
  const [report, setReport] = useState<HealthReport | null>(null);

  useEffect(() => {
    let active = true;
    checkApiHealth().then(r => {
      if (active) setReport(r);
    });
    return () => {
      active = false;
    };
  }, []);

  const flagRows: { key: string; label: string; on: boolean }[] = [
    { key: 'atlas', label: 'Atlas module', on: FEATURES.atlas },
    { key: 'orchidZoo', label: 'Orchid Zoo', on: FEATURES.orchidZoo },
    { key: 'oacs', label: 'OACS telemetry', on: FEATURES.oacs },
    { key: 'demoMode', label: 'Demo fallbacks', on: FEATURES.demoMode },
  ];

  return (
    <section
      id="infrastructure"
      className="relative py-28 bg-[#0d1f17] text-white border-t border-white/5"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-14">
          <div className="max-w-2xl">
            <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/80 mb-4">
              Biodiversity Intelligence Infrastructure
            </div>
            <h2 className="font-serif text-4xl md:text-5xl leading-tight">
              An open, API-first platform —<br />
              <span className="italic text-emerald-200/90">
                built so science can rely on it.
              </span>
            </h2>
          </div>
          <div className="flex flex-col items-start lg:items-end gap-3">
            <StatusPill report={report} />
            <div className="text-[11px] tracking-[0.2em] uppercase text-white/45">
              {API_CONFIGURED ? (
                <>base · <span className="text-white/65 normal-case tracking-normal">{API_BASE_URL}</span></>
              ) : (
                'VITE_API_BASE_URL not set — running on demo fallbacks'
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          {PILLARS.map(p => {
            const Icon = p.icon;
            return (
              <div key={p.label} className="bg-[#142a1f] p-7">
                <div className="w-10 h-10 rounded-lg bg-emerald-300/10 border border-emerald-300/30 flex items-center justify-center mb-5">
                  <Icon className="h-4 w-4 text-emerald-200" />
                </div>
                <div className="font-serif text-lg text-white mb-2">
                  {p.label}
                </div>
                <p className="text-sm text-white/65 leading-relaxed">{p.body}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 rounded-2xl border border-white/10 bg-[#142a1f] p-7">
            <div className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-emerald-300/80 mb-5">
              <Activity className="h-3.5 w-3.5" /> Module flags ·{' '}
              <span className="text-white/50 normal-case tracking-normal">
                VITE_ENABLE_*
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {flagRows.map(f => (
                <div
                  key={f.key}
                  className="flex items-center justify-between rounded-lg border border-white/10 px-4 py-3 bg-[#0d1f17]/40"
                >
                  <span className="text-sm text-white/80">{f.label}</span>
                  <span
                    className={
                      'text-[10px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full ' +
                      (f.on
                        ? 'bg-emerald-300/15 text-emerald-200 border border-emerald-300/40'
                        : 'bg-white/5 text-white/55 border border-white/15')
                    }
                  >
                    {f.on ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#142a1f] p-7">
            <div className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-emerald-300/80 mb-5">
              <ShieldCheck className="h-3.5 w-3.5" /> Boundary
            </div>
            <p className="text-sm text-white/70 leading-relaxed">
              The website only ever speaks to the Continuum scientific
              API. Credentials, sync workers, and AI pipelines all live
              safely behind it — never in the page you're reading.
            </p>
            <div className="mt-5 text-[11px] tracking-[0.2em] uppercase text-white/45">
              No credentials in the browser
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default BiodiversityInfrastructure;
