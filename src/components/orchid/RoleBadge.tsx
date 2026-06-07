import React from 'react';
import {
  Compass,
  Sprout,
  GraduationCap,
  Presentation,
  Microscope,
  Trees,
  Users,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

/**
 * RoleBadge
 * ---------
 * Visual indicator for the seven Orchid Continuum user ecosystems.
 * Used on dashboards, profile cards, and project workspaces to make
 * role-based access feel like *belonging to a community of practice*
 * rather than a permission system.
 *
 * Colors are tuned for the dark observatory palette — never neon.
 */

export type RoleKey =
  | 'public'
  | 'grower'
  | 'student'
  | 'teacher'
  | 'researcher'
  | 'organization'
  | 'society'
  | 'admin';

interface RoleSpec {
  label: string;
  Icon: LucideIcon;
  /** Tailwind classes for ring + text + bg dot. */
  tone: string;
  blurb: string;
}

export const ROLES: Record<RoleKey, RoleSpec> = {
  public: {
    label: 'Public Explorer',
    Icon: Compass,
    tone: 'border-sky-300/40 text-sky-200 bg-sky-300/5',
    blurb: 'Browse galleries, atlas, and stories.',
  },
  grower: {
    label: 'Orchid Grower',
    Icon: Sprout,
    tone: 'border-emerald-300/40 text-emerald-200 bg-emerald-300/5',
    blurb: 'Tend a living collection with OACS support.',
  },
  student: {
    label: 'Student',
    Icon: GraduationCap,
    tone: 'border-amber-300/40 text-amber-200 bg-amber-300/5',
    blurb: 'Learn through guided scientific inquiry.',
  },
  teacher: {
    label: 'Teacher',
    Icon: Presentation,
    tone: 'border-violet-300/40 text-violet-200 bg-violet-300/5',
    blurb: 'Run classroom investigations and assignments.',
  },
  researcher: {
    label: 'Researcher',
    Icon: Microscope,
    tone: 'border-cyan-300/40 text-cyan-200 bg-cyan-300/5',
    blurb: 'Query traits, ecological networks, and exports.',
  },
  organization: {
    label: 'Conservation Organization',
    Icon: Trees,
    tone: 'border-lime-300/40 text-lime-200 bg-lime-300/5',
    blurb: 'Coordinate projects, volunteers, and protocols.',
  },
  society: {
    label: 'Orchid Society',
    Icon: Users,
    tone: 'border-rose-300/40 text-rose-200 bg-rose-300/5',
    blurb: 'Engage members, events, and shared knowledge.',
  },
  admin: {
    label: 'Steward',
    Icon: ShieldCheck,
    tone: 'border-white/30 text-white/85 bg-white/[0.04]',
    blurb: 'Curate scientific quality across the Continuum.',
  },
};

export interface RoleBadgeProps {
  role: RoleKey;
  size?: 'sm' | 'md';
  withLabel?: boolean;
}

const RoleBadge: React.FC<RoleBadgeProps> = ({
  role,
  size = 'md',
  withLabel = true,
}) => {
  const spec = ROLES[role];
  const { Icon, label, tone } = spec;
  const sz =
    size === 'sm'
      ? 'h-3 w-3 text-[9px] tracking-[0.18em] px-2 py-0.5'
      : 'h-3.5 w-3.5 text-[10px] tracking-[0.22em] px-2.5 py-1';

  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-full border uppercase ' +
        tone +
        ' ' +
        sz
      }
    >
      <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      {withLabel && <span>{label}</span>}
    </span>
  );
};

export default RoleBadge;
