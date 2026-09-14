import React from 'react';
import { AlertTriangle, Database, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import PageShell from '@/components/orchid/PageShell';
import RoleBadge from '@/components/orchid/RoleBadge';

/**
 * Public organization profile placeholder.
 *
 * The frontend must not infer an organization name, location, contact, member
 * count, partnerships, or projects from a route slug. Until the governed
 * organization endpoint supplies a verified public record, this page exposes
 * only the requested record key and an explicit unavailable state.
 */
const OrganizationProfile: React.FC = () => {
  const { slug = '' } = useParams();
  const recordKey = slug.trim() || 'not-supplied';

  return (
    <PageShell
      eyebrow="Organizational profile"
      title="Organization profile unavailable"
      intro="No verified public organization record is available for this route. Orchid Continuum will not invent partner identity, contact details, membership, agreements, or project claims."
      heroAside={
        <div className="rounded-xl border border-amber-300/30 bg-amber-300/[0.05] p-5">
          <div className="flex items-center gap-2 text-[10px] tracking-[0.22em] uppercase text-amber-200/90 mb-2">
            <AlertTriangle className="h-4 w-4" /> Unverified placeholder
          </div>
          <p className="text-sm text-white/85 leading-relaxed">
            Awaiting a governed record from{' '}
            <code className="text-amber-200">/api/organizations/{recordKey}</code>
          </p>
        </div>
      }
    >
      <section className="max-w-5xl mx-auto px-6 lg:px-10 py-16">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-7">
            <div className="flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-emerald-200/80 mb-4">
              <Database className="h-4 w-4" /> Requested record
            </div>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-white/45">Organization key</dt>
                <dd data-testid="organization-record-key" className="mt-1 font-mono text-white/80">
                  {recordKey}
                </dd>
              </div>
              <div>
                <dt className="text-white/45">Verified public data</dt>
                <dd className="mt-1 text-white/75">Unavailable</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-7">
            <div className="flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-emerald-200/80 mb-4">
              <ShieldCheck className="h-4 w-4" /> Disclosure boundary
            </div>
            <p className="text-sm text-white/70 leading-relaxed">
              Location, contacts, member counts, partner relationships, agreement terms,
              and projects remain hidden until the backend returns fields explicitly
              approved for public display.
            </p>
            <div className="mt-4">
              <RoleBadge role="organization" size="sm" />
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-7 text-center">
          <h2 className="font-serif text-2xl text-white">No verified projects to display</h2>
          <p className="mt-3 text-sm text-white/65">
            Project and team cards will appear only when linked to an authenticated,
            governed organization response.
          </p>
          <Link
            to="/conservation"
            className="mt-6 inline-block rounded-full border border-emerald-300/30 px-5 py-2.5 text-sm text-emerald-200 hover:text-emerald-100"
          >
            Back to Conservation Hub
          </Link>
        </div>
      </section>
    </PageShell>
  );
};

export default OrganizationProfile;
