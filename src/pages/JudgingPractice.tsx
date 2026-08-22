import React, { useMemo, useState } from 'react';
import { Award, ClipboardList, Info } from 'lucide-react';

import PageShell from '@/components/orchid/PageShell';
import {
  JUDGING_ORGANIZATIONS,
  RUBRIC_PROVENANCE,
  judgingOrganization,
  scorePracticeSheet,
} from '@/lib/judgingPractice';

/**
 * A judging practice sheet, recovered from the retired FCOS judging
 * application.
 *
 * The capability came across; the authority claim did not. The original sent
 * the orchid to GPT-4o, took the model's numbers as the scores, and stored the
 * result as a suggested award level. Here a person enters every score, the
 * arithmetic is deterministic, nothing is persisted, and no award is issued or
 * predicted.
 *
 * The rubric is an unverified historical snapshot and says so on the page. A
 * tool that quietly implied it knew the American Orchid Society's current
 * requirements would be worse than no tool.
 */
export default function JudgingPractice() {
  const [organizationCode, setOrganizationCode] = useState('AOS');
  const [category, setCategory] = useState('flower');
  const [entered, setEntered] = useState<Record<string, number | null>>({});

  const organization = judgingOrganization(organizationCode);
  const categories = organization ? Object.keys(organization.categories) : [];
  const activeCategory = categories.includes(category) ? category : (categories[0] ?? 'flower');

  const result = useMemo(
    () => scorePracticeSheet(organizationCode, activeCategory, entered),
    [organizationCode, activeCategory, entered],
  );

  const reset = (nextOrganization: string, nextCategory: string) => {
    // Scores are per-rubric. Carrying them across a rubric change would attach
    // numbers to criteria they were never entered against.
    setOrganizationCode(nextOrganization);
    setCategory(nextCategory);
    setEntered({});
  };

  return (
    <PageShell
      eyebrow="Education"
      title="Judging practice"
      titleAccent="score a sheet the way a judge would."
      intro="Work through a judging rubric criterion by criterion and see where the total lands. This is a practice sheet for learning the structure of orchid judging — you enter every score yourself."
      heroAside={
        <div className="rounded-2xl border border-amber-300/30 bg-amber-300/5 p-5">
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-amber-300/80">
            <Info className="h-3 w-3" /> Not a real award
          </div>
          <p className="text-xs leading-relaxed text-white/65">
            {RUBRIC_PROVENANCE.statement}
          </p>
          <p className="mt-3 text-[10px] leading-relaxed text-white/45">
            Recovered from {RUBRIC_PROVENANCE.source}.
          </p>
        </div>
      }
    >
      <section className="py-10">
        <div className="mx-auto max-w-5xl px-6 lg:px-10">
          <div className="flex flex-wrap gap-6">
            <label className="text-sm text-white/70">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-white/45">
                Organisation
              </span>
              <select
                value={organizationCode}
                onChange={(event) => reset(event.target.value, activeCategory)}
                className="rounded-lg border border-white/15 bg-[#11101b] px-3 py-2 text-sm"
              >
                {JUDGING_ORGANIZATIONS.map((org) => (
                  <option key={org.code} value={org.code}>
                    {org.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-white/70">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-white/45">
                Category
              </span>
              <select
                value={activeCategory}
                onChange={(event) => reset(organizationCode, event.target.value)}
                className="rounded-lg border border-white/15 bg-[#11101b] px-3 py-2 text-sm capitalize"
              >
                {categories.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {result ? (
            <>
              <ol className="mt-8 space-y-3" data-testid="criteria">
                {result.entries.map((entry) => (
                  <li
                    key={entry.criteria}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex sm:items-center sm:justify-between sm:gap-6"
                  >
                    <div>
                      <div className="text-sm text-white">{entry.criteria}</div>
                      <div className="mt-0.5 text-xs text-white/50">
                        {
                          organization?.categories[activeCategory].find(
                            (criterion) => criterion.criteria === entry.criteria,
                          )?.description
                        }
                      </div>
                    </div>
                    <div className="mt-3 flex shrink-0 items-center gap-2 sm:mt-0">
                      <input
                        type="number"
                        min={0}
                        max={entry.maxPoints}
                        value={entry.points ?? ''}
                        aria-label={`${entry.criteria} points out of ${entry.maxPoints}`}
                        onChange={(event) =>
                          setEntered((current) => ({
                            ...current,
                            [entry.criteria]:
                              event.target.value === '' ? null : Number(event.target.value),
                          }))
                        }
                        className="w-20 rounded-lg border border-white/15 bg-[#11101b] px-3 py-2 text-right text-sm"
                      />
                      <span className="text-xs text-white/45">/ {entry.maxPoints}</span>
                    </div>
                  </li>
                ))}
              </ol>

              <div
                className="mt-6 rounded-2xl border border-amber-300/25 bg-amber-300/[0.06] p-5"
                data-testid="practice-result"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-white">
                    <ClipboardList className="h-4 w-4 text-amber-200" />
                    {result.total} of {result.maxTotal} points
                  </div>
                  {result.complete ? (
                    result.band ? (
                      <div className="flex items-center gap-2 text-sm text-amber-100">
                        <Award className="h-4 w-4" />
                        Reaches the {result.band.name} band ({result.band.code})
                      </div>
                    ) : (
                      <div className="text-sm text-white/70">
                        Below the lowest scored band in this rubric
                      </div>
                    )
                  ) : (
                    // A partial sheet is not a low score and not a high one.
                    <div className="text-sm text-white/70">
                      {result.unscored.length} criteri{result.unscored.length === 1 ? 'on' : 'a'} not
                      yet scored — no band until the sheet is complete
                    </div>
                  )}
                </div>

                <p className="mt-3 text-xs leading-relaxed text-white/60">
                  This is arithmetic over the numbers you entered. It is a practice result, not an
                  award, not a prediction of one, and not a judgement about any plant. Nothing here
                  is saved or submitted anywhere.
                </p>

                {result.nonScoredRecognitions.length ? (
                  <div className="mt-4 border-t border-white/10 pt-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">
                      Recorded in this rubric but not decided by a point total
                    </div>
                    <ul className="mt-2 space-y-1 text-xs text-white/60">
                      {result.nonScoredRecognitions.map((recognition) => (
                        <li key={recognition.code}>
                          <span className="text-white/80">
                            {recognition.code} · {recognition.name}
                          </span>{' '}
                          — {recognition.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <p className="mt-8 text-sm text-white/60">
              No rubric is available for that combination.
            </p>
          )}
        </div>
      </section>
    </PageShell>
  );
}
