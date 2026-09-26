import React from 'react';
import PageShell from '@/components/orchid/PageShell';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mb-10">
    <h2 className="text-xl font-serif text-[#C9A84C] mb-3">{title}</h2>
    <div className="text-[#d4c9b0] leading-relaxed space-y-3">{children}</div>
  </section>
);

const Privacy: React.FC = () => {
  return (
    <PageShell
      eyebrow="DATA STEWARDSHIP"
      title="Privacy &"
      titleAccent="Data Policy"
      intro="How Orchid Continuum collects, uses, protects, and preserves your data — and the scientific record."
    >
      <div
        data-testid="privacy-page"
        className="max-w-3xl mx-auto px-4 py-10"
      >
        <div
          role="note"
          data-testid="privacy-effective-date"
          className="mb-8 p-4 rounded-lg border border-[#C9A84C]/30 bg-[#1a2e1a]/60 text-sm text-[#d4c9b0]"
        >
          Effective: September 2026 — Orchid Continuum is in active development. This policy reflects
          current practice and will be updated as new features launch.
        </div>

        <Section title="What we collect">
          <p>
            <strong className="text-white">Account data:</strong> If you create an account, we store
            your email address and a hashed password. We do not sell or share this with third parties.
          </p>
          <p>
            <strong className="text-white">Community observations:</strong> When you submit an
            observation you provide a species name, an epistemic certainty label (Certain / Probable /
            Possible / Uncertain), optional notes, an optional observation date, and an optional
            country or region. We do not collect GPS coordinates or precise locality data for
            community-submitted records. GPS precision capable of revealing sensitive orchid
            populations is never requested, stored, or displayed.
          </p>
          <p>
            <strong className="text-white">Newsletter / contact:</strong> If you subscribe to our
            newsletter or use the contact form we collect your email address and the message you
            submit. We never pass contact form content to automated agents.
          </p>
          <p>
            <strong className="text-white">Usage data:</strong> We may collect anonymised page-view
            and interaction telemetry to improve the platform. This data does not identify you
            personally.
          </p>
        </Section>

        <Section title="Observation provenance & epistemic integrity">
          <p>
            Every community observation is tagged with an <strong className="text-white">epistemic
            certainty</strong> label chosen by the submitter. These labels — Certain, Probable,
            Possible, Uncertain — travel with the record throughout the system.
          </p>
          <p data-testid="privacy-epistemic-notice">
            Community observations are user reports. They are <em>not</em> scientific evidence,
            verified identifications, or official species records. They will never be automatically
            promoted from community submission to scientific fact. Human scientific review is
            mandatory before any observation enters the Knowledge Graph or informs conservation
            decisions.
          </p>
          <p>
            Moderation lifecycle: SUBMITTED → SCREENED → APPROVED / REJECTED / QUARANTINED. No
            observation advances past SUBMITTED without a human moderator action.
          </p>
        </Section>

        <Section title="Sensitive locality data protection">
          <p>
            Precise GPS coordinates and sub-region locality data for wild orchid populations are
            treated as sensitive. This information:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Is never requested from community observers</li>
            <li>Is never stored in community-accessible databases</li>
            <li>Is never displayed publicly, even when held by the system</li>
            <li>Is shared only with vetted conservation partners under documented data-sharing agreements</li>
          </ul>
          <p>
            This policy exists because precise locality data for threatened orchid species can enable
            illegal collection. We take it seriously.
          </p>
        </Section>

        <Section title="How we use your data">
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>To operate and improve the Orchid Continuum platform</li>
            <li>To send newsletters you opted into (unsubscribe link in every email)</li>
            <li>To respond to contact form submissions</li>
            <li>To support the scientific workflow with appropriate human review gates</li>
          </ul>
          <p>We do not use your data for advertising, profiling, or sale to third parties.</p>
        </Section>

        <Section title="Data retention & backup safeguards">
          <p>
            Account data is retained while your account is active. You may request deletion at any
            time. We maintain regular encrypted backups; backup data is subject to the same access
            controls as live data.
          </p>
          <p>
            Community observations you submit are retained as part of the scientific record even after
            account deletion, attributed to an anonymised identifier, because removing contributed
            observations could corrupt provenance chains in the Knowledge Graph.
          </p>
        </Section>

        <Section title="Security">
          <p>
            We use industry-standard practices: HTTPS everywhere, hashed passwords, access controls
            on production systems, and regular security review. No system is perfectly secure;
            if you discover a vulnerability please report it to{' '}
            <a
              href="mailto:security@orchidcontinuum.org"
              className="text-[#C9A84C] underline underline-offset-2 hover:text-[#f0c96a]"
            >
              security@orchidcontinuum.org
            </a>
            .
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            You may request access to, correction of, or deletion of your personal data. To submit a
            data request, email{' '}
            <a
              href="mailto:data@orchidcontinuum.org"
              className="text-[#C9A84C] underline underline-offset-2 hover:text-[#f0c96a]"
              data-testid="privacy-data-contact"
            >
              data@orchidcontinuum.org
            </a>
            . We will respond within 30 days.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            Material changes will be announced on the site with at least 14 days notice. The effective
            date at the top of this page reflects the last update.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Orchid Continuum is a project of the Fresno Cactus and Succulent Society, fiscally
            sponsored through Ecologistics (501(c)(3)). For privacy questions:{' '}
            <a
              href="mailto:president@fcosorchids.org"
              className="text-[#C9A84C] underline underline-offset-2 hover:text-[#f0c96a]"
            >
              president@fcosorchids.org
            </a>
          </p>
        </Section>
      </div>
    </PageShell>
  );
};

export default Privacy;
