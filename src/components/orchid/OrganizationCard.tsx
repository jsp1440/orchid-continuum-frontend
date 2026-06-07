import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Users2, FolderGit2 } from 'lucide-react';

/**
 * OrganizationCard
 * ----------------
 * Public-facing display for a conservation organization, herbarium,
 * orchid society, university lab, or partner institution. Uses verifiable
 * meta (location, member count, active projects) to convey institutional
 * credibility without falling into generic SaaS card patterns.
 *
 * This is a presentational primitive — the Conservation Hub and
 * Societies pages both pass demo data here pending the
 * `/api/organizations` endpoint.
 */
export interface OrganizationCardProps {
  slug: string;
  name: string;
  /** e.g. "Conservation Organization" · "Orchid Society" · "Herbarium" */
  kind: string;
  region?: string;
  description: string;
  memberCount?: number;
  projectCount?: number;
  emblem?: string;
  /** Comma-flagged focus areas, e.g. ["Andean cloud forest", "Pollinator monitoring"] */
  focus?: string[];
  /** Mark as a demo placeholder until backend integration. */
  demo?: boolean;
}

const OrganizationCard: React.FC<OrganizationCardProps> = ({
  slug,
  name,
  kind,
  region,
  description,
  memberCount,
  projectCount,
  emblem,
  focus = [],
  demo = false,
}) => {
  return (
    <Link
      to={`/org/${slug}`}
      className="group block rounded-2xl border border-white/10 bg-white/[0.02] hover:border-emerald-300/30 hover:bg-white/[0.04] transition-colors overflow-hidden"
    >
      <div className="p-6 flex flex-col h-full">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-900/40 border border-emerald-300/20 flex items-center justify-center text-emerald-200 font-serif text-lg shrink-0 overflow-hidden">
            {emblem ? (
              <img
                src={emblem}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              name.slice(0, 1)
            )}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.22em] uppercase text-emerald-300/80 mb-1 truncate">
              {kind}
            </div>
            <h3 className="font-serif text-lg text-white leading-snug truncate group-hover:text-emerald-100">
              {name}
            </h3>
            {region && (
              <div className="text-xs text-white/55 inline-flex items-center gap-1 mt-1">
                <MapPin className="h-3 w-3" /> {region}
              </div>
            )}
          </div>
          {demo && (
            <span className="ml-auto text-[9px] tracking-[0.2em] uppercase text-amber-200/80 border border-amber-200/30 rounded-full px-2 py-0.5 shrink-0">
              Demo
            </span>
          )}
        </div>

        <p className="text-[13px] text-white/65 leading-relaxed mb-4 font-light line-clamp-3">
          {description}
        </p>

        {focus.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {focus.slice(0, 3).map(f => (
              <span
                key={f}
                className="text-[10px] tracking-wide text-white/65 border border-white/10 rounded-full px-2 py-0.5"
              >
                {f}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto pt-4 border-t border-white/5 flex items-center gap-5 text-xs text-white/55">
          {memberCount !== undefined && (
            <span className="inline-flex items-center gap-1.5">
              <Users2 className="h-3.5 w-3.5" />
              {memberCount.toLocaleString()} members
            </span>
          )}
          {projectCount !== undefined && (
            <span className="inline-flex items-center gap-1.5">
              <FolderGit2 className="h-3.5 w-3.5" />
              {projectCount} projects
            </span>
          )}
        </div>
      </div>
    </Link>
  );
};

export default OrganizationCard;
