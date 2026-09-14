import React, { useMemo, useState } from "react";
import { Brain, Network, Route, ShieldCheck, Sparkles } from "lucide-react";
import Navbar from "@/components/orchid/Navbar";
import Footer from "@/components/orchid/Footer";
import {
  planSpecialistCouncil,
  SPECIALIST_COUNCIL,
  type MissionKind,
} from "@/lib/specialistCouncil";

const missionKinds: MissionKind[] = [
  "taxonomy",
  "species-profile",
  "trait-analysis",
  "research",
  "analysis",
  "conservation",
  "lesson",
  "interface",
  "harvest",
  "data-quality",
];

const AIOrchestration: React.FC = () => {
  const [kind, setKind] = useState<MissionKind>("trait-analysis");
  const [scientific, setScientific] = useState(true);
  const [publicationCandidate, setPublicationCandidate] = useState(false);
  const [needsQuantitativeAnalysis, setNeedsQuantitativeAnalysis] = useState(true);
  const [needsConservationAssessment, setNeedsConservationAssessment] = useState(false);

  const activation = useMemo(
    () =>
      planSpecialistCouncil({
        kind,
        scientific,
        publicationCandidate,
        needsQuantitativeAnalysis,
        needsConservationAssessment,
      }),
    [kind, scientific, publicationCandidate, needsQuantitativeAnalysis, needsConservationAssessment],
  );

  const activeIds = new Set([
    activation.coordinator,
    ...activation.specialists,
    ...(activation.reviewer ? [activation.reviewer] : []),
  ]);

  return (
    <div className="min-h-screen bg-[#07140d] text-[#f5f0e8]">
      <Navbar />
      <main className="pt-24">
        <section className="border-b border-white/[0.08] bg-[#0a170f]">
          <div className="mx-auto max-w-[1400px] px-6 py-12 lg:px-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-[#d4b34a]">
              <Network className="h-3.5 w-3.5" /> Specialist Council v1
            </div>
            <h1 className="mt-5 max-w-5xl text-4xl leading-tight md:text-6xl" style={{ fontFamily: "Playfair Display, Georgia, serif" }}>
              Calyx routes the mission.
            </h1>
            <p className="mt-4 max-w-3xl text-[16px] leading-7 text-[#cfc8b8]/88">
              One durable council now unifies the Continuum&apos;s scientific, educational, design, data, and review roles. Provider tools execute work; they no longer define the architecture.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-[1400px] px-6 py-8 lg:px-10">
          <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <article className="rounded-[1.5rem] border border-white/[0.08] bg-[#0d1d13]/90 p-5 lg:p-6">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[#d4b34a]">
                <Route className="h-4 w-4" /> Mission router
              </div>
              <label className="mt-5 block text-sm text-[#cfc8b8]">
                Mission type
                <select
                  value={kind}
                  onChange={(event) => setKind(event.target.value as MissionKind)}
                  className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-[#faf7f2]"
                >
                  {missionKinds.map((missionKind) => (
                    <option key={missionKind} value={missionKind}>{missionKind}</option>
                  ))}
                </select>
              </label>
              {[
                ["Scientific mission", scientific, setScientific],
                ["Publication candidate", publicationCandidate, setPublicationCandidate],
                ["Needs quantitative analysis", needsQuantitativeAnalysis, setNeedsQuantitativeAnalysis],
                ["Needs conservation assessment", needsConservationAssessment, setNeedsConservationAssessment],
              ].map(([label, checked, setter]) => (
                <label key={String(label)} className="mt-4 flex items-center gap-3 text-sm text-[#cfc8b8]">
                  <input
                    type="checkbox"
                    checked={Boolean(checked)}
                    onChange={(event) => (setter as React.Dispatch<React.SetStateAction<boolean>>)(event.target.checked)}
                    className="h-4 w-4 accent-[#d4b34a]"
                  />
                  {String(label)}
                </label>
              ))}
            </article>

            <article className="rounded-[1.5rem] border border-[#d4b34a]/18 bg-[#102816]/88 p-5 lg:p-6">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[#d4b34a]">
                <Brain className="h-4 w-4" /> Activation record
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-300">Coordinator</div>
                  <div className="mt-2 text-xl">Calyx Executive</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-300">Review gate</div>
                  <div className="mt-2 text-xl">{activation.reviewer ? "Scientific Reviewer" : "Not required"}</div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {activation.specialists.map((id) => {
                  const role = SPECIALIST_COUNCIL.find((candidate) => candidate.id === id);
                  return <span key={id} className="rounded-full border border-[#d4b34a]/25 bg-[#d4b34a]/10 px-3 py-1.5 text-xs text-[#ead778]">{role?.name ?? id}</span>;
                })}
              </div>
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-[#cfc8b8]">
                <div>Automatic publication: <strong className="text-[#faf7f2]">disabled</strong></div>
                <div>Owner approval: <strong className="text-[#faf7f2]">{activation.ownerApprovalRequired ? "required" : "not required for this route"}</strong></div>
                {activation.warnings.map((warning) => <div key={warning} className="mt-2 text-amber-300">{warning}</div>)}
              </div>
            </article>
          </div>

          <section className="mt-5 rounded-[1.5rem] border border-white/[0.08] bg-[#0d1d13]/90 p-5 lg:p-6">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[#d4b34a]">
              <Sparkles className="h-4 w-4" /> Canonical specialist registry
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {SPECIALIST_COUNCIL.map((role) => (
                <article key={role.id} className={`rounded-2xl border p-4 ${activeIds.has(role.id) ? "border-[#d4b34a]/45 bg-[#d4b34a]/10" : "border-white/[0.08] bg-black/20"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-xl text-[#faf7f2]" style={{ fontFamily: "Playfair Display, Georgia, serif" }}>{role.name}</h2>
                    {activeIds.has(role.id) && <span className="rounded-full bg-emerald-400/15 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.16em] text-emerald-300">active</span>}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#cfc8b8]/78">{role.purpose}</p>
                  <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.14em] text-[#d4b34a]">Provenance · {role.provenance}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-5 grid gap-5 lg:grid-cols-2">
            <article className="rounded-[1.5rem] border border-white/[0.08] bg-[#0d1d13]/90 p-5 lg:p-6">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[#d4b34a]">
                <ShieldCheck className="h-4 w-4" /> Scientific integrity
              </div>
              <p className="mt-4 text-sm leading-6 text-[#cfc8b8]/80">
                Scientific missions cannot promote themselves. The independent reviewer must pass the evidence, method, provenance, and counterargument audit; publication candidates additionally require owner approval.
              </p>
            </article>
            <article className="rounded-[1.5rem] border border-white/[0.08] bg-[#0d1d13]/90 p-5 lg:p-6">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[#d4b34a]">
                <Network className="h-4 w-4" /> Current delivery slice
              </div>
              <p className="mt-4 text-sm leading-6 text-[#cfc8b8]/80">
                This slice implements the canonical roles, deterministic minimum-sufficient routing, specialist caps, and promotion gates. Backend persistence and provider adapters remain explicitly separate follow-on work.
              </p>
            </article>
          </section>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default AIOrchestration;
