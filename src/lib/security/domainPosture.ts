/**
 * Read-only domain & email-authentication posture assessment.
 *
 * This module NEVER changes DNS. It consumes already-fetched DNS/HTTP records
 * (supplied by an authorized backend collector) and produces an explainable
 * posture report. Splitting fetch from assessment keeps the logic pure and
 * fully testable, and keeps this frontend module free of network side effects.
 *
 * Required configuration (domain names, DKIM selectors) is NOT guessed. When a
 * selector is unknown, the check reports "unknown — configuration required"
 * rather than inventing one. See docs/security/DOMAIN_POSTURE_CONFIG.md.
 */

export type PostureStatus = 'pass' | 'warn' | 'fail' | 'unknown';

export interface PostureFinding {
  check: string;
  status: PostureStatus;
  detail: string;
  /** Actionable guidance (never an automatic change). */
  guidance?: string;
}

/** Records the collector supplies. All optional — absence → "unknown". */
export interface DomainRecords {
  domain: string;
  /** TXT records at the apex (for SPF). */
  txt?: string[];
  /** _dmarc TXT records. */
  dmarcTxt?: string[];
  /** DKIM TXT keyed by selector: { "selector1": ["v=DKIM1; k=rsa; p=..."] }. */
  dkim?: Record<string, string[]>;
  /** Known DKIM selectors from configuration (so we know what to expect). */
  expectedDkimSelectors?: string[];
  /** TLS certificate info if available. */
  certificate?: { validTo?: string; issuer?: string; daysRemaining?: number };
  /** Domain registration expiry if reliably obtainable. */
  registrationExpiry?: string;
  /** Subdomain → CNAME target, for dangling detection. */
  cnames?: Record<string, string>;
  /** Targets known to be decommissioned (dangling risk). */
  decommissionedTargets?: string[];
}

function assessSpf(records: DomainRecords): PostureFinding {
  const spf = (records.txt ?? []).find((t) => /^v=spf1/i.test(t.trim()));
  if (!spf) {
    return {
      check: 'SPF',
      status: 'fail',
      detail: 'No SPF (v=spf1) record found.',
      guidance: 'Publish an SPF record listing authorized senders, ending in -all or ~all.',
    };
  }
  if (/\+all\b/.test(spf)) {
    return {
      check: 'SPF',
      status: 'fail',
      detail: 'SPF ends with +all, which authorizes any sender.',
      guidance: 'Change +all to -all (strict) or ~all (soft-fail).',
    };
  }
  if (!/[~-]all\b/.test(spf)) {
    return {
      check: 'SPF',
      status: 'warn',
      detail: 'SPF has no explicit all mechanism.',
      guidance: 'Append -all or ~all to define the default policy.',
    };
  }
  return { check: 'SPF', status: 'pass', detail: 'SPF present with a restrictive all mechanism.' };
}

function assessDmarc(records: DomainRecords): PostureFinding {
  const dmarc = (records.dmarcTxt ?? []).find((t) => /^v=DMARC1/i.test(t.trim()));
  if (!dmarc) {
    return {
      check: 'DMARC',
      status: 'fail',
      detail: 'No DMARC record at _dmarc.',
      guidance: 'Publish v=DMARC1; start with p=none and an rua reporting address, then tighten.',
    };
  }
  const policy = /\bp=(none|quarantine|reject)\b/i.exec(dmarc)?.[1]?.toLowerCase();
  const hasRua = /\brua=/i.test(dmarc);
  if (policy === 'none') {
    return {
      check: 'DMARC',
      status: 'warn',
      detail: 'DMARC policy is p=none (monitoring only).',
      guidance: hasRua
        ? 'Review aggregate reports, then move to p=quarantine and p=reject.'
        : 'Add an rua reporting address and progress toward p=quarantine/reject.',
    };
  }
  if (policy === 'quarantine' || policy === 'reject') {
    return {
      check: 'DMARC',
      status: hasRua ? 'pass' : 'warn',
      detail: `DMARC policy is p=${policy}.`,
      guidance: hasRua ? undefined : 'Add an rua address so failures are visible.',
    };
  }
  return { check: 'DMARC', status: 'warn', detail: 'DMARC present but policy unclear.' };
}

function assessDkim(records: DomainRecords): PostureFinding[] {
  const selectors = records.expectedDkimSelectors ?? [];
  if (selectors.length === 0) {
    return [
      {
        check: 'DKIM',
        status: 'unknown',
        detail: 'No DKIM selectors configured; cannot assess without known selectors.',
        guidance:
          'Provide the DKIM selectors in configuration (DOMAIN_POSTURE_CONFIG.md). Selectors are not guessable.',
      },
    ];
  }
  return selectors.map((sel) => {
    const rec = records.dkim?.[sel];
    const key = rec?.find((r) => /v=DKIM1/i.test(r));
    if (!key) {
      return {
        check: `DKIM:${sel}`,
        status: 'fail',
        detail: `No DKIM key published for selector "${sel}".`,
        guidance: 'Publish the DKIM public key TXT record for this selector.',
      };
    }
    if (/\bp=;/.test(key) || /\bp=\s*$/.test(key)) {
      return {
        check: `DKIM:${sel}`,
        status: 'fail',
        detail: `DKIM selector "${sel}" has an empty public key (revoked).`,
      };
    }
    return { check: `DKIM:${sel}`, status: 'pass', detail: `DKIM key present for "${sel}".` };
  });
}

function assessCertificate(records: DomainRecords): PostureFinding {
  const cert = records.certificate;
  if (!cert || cert.daysRemaining === undefined) {
    return { check: 'HTTPS certificate', status: 'unknown', detail: 'No certificate data supplied.' };
  }
  if (cert.daysRemaining < 0) {
    return { check: 'HTTPS certificate', status: 'fail', detail: 'Certificate has expired.' };
  }
  if (cert.daysRemaining <= 14) {
    return {
      check: 'HTTPS certificate',
      status: 'warn',
      detail: `Certificate expires in ${cert.daysRemaining} day(s).`,
      guidance: 'Renew before expiry to avoid an outage.',
    };
  }
  return {
    check: 'HTTPS certificate',
    status: 'pass',
    detail: `Certificate valid for ${cert.daysRemaining} more day(s).`,
  };
}

function assessRegistration(records: DomainRecords): PostureFinding {
  if (!records.registrationExpiry) {
    return { check: 'Domain registration', status: 'unknown', detail: 'Expiry not obtainable.' };
  }
  const days = Math.round(
    (Date.parse(records.registrationExpiry) - Date.now()) / 86400000,
  );
  if (Number.isNaN(days)) {
    return { check: 'Domain registration', status: 'unknown', detail: 'Unparseable expiry date.' };
  }
  if (days <= 30) {
    return {
      check: 'Domain registration',
      status: days <= 0 ? 'fail' : 'warn',
      detail: `Domain registration ${days <= 0 ? 'has expired' : `expires in ${days} day(s)`}.`,
      guidance: 'Renew registration and enable auto-renew + registrar lock.',
    };
  }
  return { check: 'Domain registration', status: 'pass', detail: `Registered for ${days} more day(s).` };
}

function assessDangling(records: DomainRecords): PostureFinding[] {
  const cnames = records.cnames ?? {};
  const decommissioned = new Set(records.decommissionedTargets ?? []);
  const findings: PostureFinding[] = [];
  for (const [sub, target] of Object.entries(cnames)) {
    if (decommissioned.has(target)) {
      findings.push({
        check: `Dangling DNS:${sub}`,
        status: 'fail',
        detail: `${sub} points to decommissioned target ${target} (subdomain-takeover risk).`,
        guidance: 'Remove or repoint the CNAME.',
      });
    }
  }
  return findings;
}

export interface DomainPostureReport {
  domain: string;
  generated_at: string;
  findings: PostureFinding[];
  summary: { pass: number; warn: number; fail: number; unknown: number };
  /** Overall status = worst finding. */
  overall: PostureStatus;
  /** Always true — this subsystem only reads. */
  read_only: true;
}

const STATUS_RANK: Record<PostureStatus, number> = { pass: 0, unknown: 1, warn: 2, fail: 3 };

/**
 * Assess domain posture from supplied records. Pure — no network. Returns a
 * structured report the Trust Center renders.
 */
export function assessDomainPosture(
  records: DomainRecords,
  options: { now?: () => Date } = {},
): DomainPostureReport {
  const now = options.now ?? (() => new Date());
  const findings: PostureFinding[] = [
    assessSpf(records),
    assessDmarc(records),
    ...assessDkim(records),
    assessCertificate(records),
    assessRegistration(records),
    ...assessDangling(records),
  ];

  const summary = { pass: 0, warn: 0, fail: 0, unknown: 0 };
  let overall: PostureStatus = 'pass';
  for (const f of findings) {
    summary[f.status] += 1;
    if (STATUS_RANK[f.status] > STATUS_RANK[overall]) overall = f.status;
  }

  return {
    domain: records.domain,
    generated_at: now().toISOString(),
    findings,
    summary,
    overall,
    read_only: true,
  };
}
