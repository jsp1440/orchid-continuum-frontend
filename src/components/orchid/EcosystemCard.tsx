import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import RoleBadge, { type RoleKey } from './RoleBadge';

/**
 * EcosystemCard
 * -------------
 * A card representing one of the seven Orchid Continuum user ecosystems
 * (Public Explorer, Grower, Student, Teacher, Researcher, Conservation
 * Organization, Orchid Society). Used on the /ecosystems landing page
 * and in the homepage "Who is the Continuum for?" band.
 */
export interface EcosystemCardProps {
  role: RoleKey;
  Icon: LucideIcon;
  /** Short headline describing what this audience does on the platform. */
  headline: string;
  /** Two-sentence description of value delivered. */
  description: string;
  /** Three to five concrete capabilities. */
  capabilities: string[];
  /** Primary route this ecosystem opens onto. */
  route: string;
  /** Optional secondary route for a "see also" link. */
  secondaryRoute?: { label: string; route: string };
}

const EcosystemCard: React.FC<EcosystemCardProps> = ({
  role,
  Icon,
  headline,
  description,
  capabilities,
  route,
  secondaryRoute,
}) => {
  return (
    <div className="group relative rounded-2xl border border-white/10 bg-white/[0.02] p-7 hover:border-emerald-300/30 hover:bg-white/[0.035] transition-colors flex flex-col">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="w-11 h-11 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-center text-emerald-200 group-hover:text-emerald-100 transition-colors">
          <Icon className="h-5 w-5" />
        </div>
        <RoleBadge role={role} size="sm" />
      </div>

      <h3 className="font-serif text-2xl text-white leading-tight mb-3">
        {headline}
      </h3>
      <p className="text-sm text-white/70 leading-relaxed mb-5 font-light">
        {description}
      </p>

      <ul className="space-y-2 mb-7">
        {capabilities.map(c => (
          <li
            key={c}
            className="text-[13px] text-white/65 flex items-start gap-2 leading-relaxed"
          >
            <span className="mt-1.5 w-1 h-1 rounded-full bg-emerald-300/70 shrink-0" />
            {c}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 pt-4 border-t border-white/5">
        <Link
          to={route}
          className="inline-flex items-center gap-1.5 text-sm text-emerald-200 hover:text-emerald-100 font-medium"
        >
          Enter
          <ArrowUpRight className="h-4 w-4" />
        </Link>
        {secondaryRoute && (
          <Link
            to={secondaryRoute.route}
            className="text-xs text-white/55 hover:text-emerald-200 tracking-wide"
          >
            {secondaryRoute.label}
          </Link>
        )}
      </div>
    </div>
  );
};

export default EcosystemCard;
