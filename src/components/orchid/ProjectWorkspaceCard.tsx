import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Users2, Activity } from 'lucide-react';
import RoleBadge, { type RoleKey } from './RoleBadge';

/**
 * ProjectWorkspaceCard
 * --------------------
 * Surfaces a conservation, research, or citizen-science project as a
 * collaborative workspace. Designed to read as a *living investigation*
 * (status pulse, contributors, last activity) rather than a Jira ticket.
 */
export interface ProjectWorkspaceCardProps {
  slug: string;
  title: string;
  /** Owning organization name (display only). */
  organization: string;
  region?: string;
  summary: string;
  /** Project lifecycle phase. */
  phase: 'Planning' | 'Active fieldwork' | 'Analysis' | 'Reporting' | 'Archived';
  contributors?: number;
  /** ISO date string for last meaningful activity. */
  lastActivity?: string;
  /** Audiences invited to participate. */
  openTo?: RoleKey[];
  /** Mark as demo placeholder. */
  demo?: boolean;
}

const phaseTone: Record<ProjectWorkspaceCardProps['phase'], string> = {
  Planning: 'text-sky-200 border-sky-300/30 bg-sky-300/5',
  'Active fieldwork': 'text-emerald-200 border-emerald-300/40 bg-emerald-300/10',
  Analysis: 'text-cyan-200 border-cyan-300/30 bg-cyan-300/5',
  Reporting: 'text-amber-200 border-amber-300/30 bg-amber-300/5',
  Archived: 'text-white/55 border-white/15 bg-white/[0.02]',
};

function relTime(iso?: string): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return 'today';
  if (days < 7) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const ProjectWorkspaceCard: React.FC<ProjectWorkspaceCardProps> = ({
  slug,
  title,
  organization,
  region,
  summary,
  phase,
  contributors,
  lastActivity,
  openTo = [],
  demo = false,
}) => {
  return (
    <Link
      to={`/project/${slug}`}
      className="group block rounded-2xl border border-white/10 bg-white/[0.02] hover:border-emerald-300/30 hover:bg-white/[0.04] transition-colors p-6"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <span
          className={
            'text-[10px] tracking-[0.22em] uppercase rounded-full border px-2 py-0.5 ' +
            phaseTone[phase]
          }
        >
          <Activity className="inline h-3 w-3 mr-1 -mt-0.5" />
          {phase}
        </span>
        {demo && (
          <span className="text-[9px] tracking-[0.2em] uppercase text-amber-200/80 border border-amber-200/30 rounded-full px-2 py-0.5">
            Demo
          </span>
        )}
      </div>

      <h3 className="font-serif text-xl text-white leading-snug mb-1 group-hover:text-emerald-100">
        {title}
      </h3>
      <div className="text-xs text-white/55 mb-4">
        {organization}
        {region ? ` · ${region}` : ''}
      </div>

      <p className="text-[13px] text-white/70 leading-relaxed font-light mb-5">
        {summary}
      </p>

      {openTo.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {openTo.map(r => (
            <RoleBadge key={r} role={r} size="sm" />
          ))}
        </div>
      )}

      <div className="pt-4 border-t border-white/5 flex items-center gap-5 text-xs text-white/55">
        {contributors !== undefined && (
          <span className="inline-flex items-center gap-1.5">
            <Users2 className="h-3.5 w-3.5" />
            {contributors} contributors
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          {relTime(lastActivity)}
        </span>
      </div>
    </Link>
  );
};

export default ProjectWorkspaceCard;
