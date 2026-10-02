import React from 'react';
import { SectionHeading } from './ui';

const classes=[
  ['A','Literature-constrained','Figure properties constrained by documented botanical descriptions and evidence.'],
  ['B','Specimen-constrained','Figure properties constrained by measured or annotated specimen/image evidence.'],
  ['C','Composite scientific','A scientific composite assembled from multiple documented sources with explicit provenance.'],
  ['D','Conceptual diagram','A teaching or explanatory diagram whose geometry is illustrative rather than measured specimen anatomy.'],
  ['E','Decorative','Visual material not intended to support scientific character interpretation.'],
];

const workflow=[
  ['1','Prefer authentic evidence','Use a correctly identified photograph, specimen image, microscopy image, or historical botanical plate when it communicates the concept adequately.'],
  ['2','Define the scientific question','State exactly what structure, character, process, or relationship the visual must explain before selecting or generating imagery.'],
  ['3','Build the evidence package','Use authoritative botanical descriptions, primary literature, specimens, and multiple properly identified photographs. Measurements and diagnostic characters are added when supported.'],
  ['4','Render only from constraints','AI may assist rendering, but it must not invent unsupported anatomy, measurements, chemistry, physiology, ecology, or species characters.'],
  ['5','Validate against sources','Compare the resulting figure with its evidence package, record limitations, and keep machine review separate from expert scientific review.'],
  ['6','Publish with provenance','Clearly identify photographs versus AI-assisted or conceptual figures, cite supporting evidence, and display the current validation state.'],
];

const stages=['Draft','Evidence-linked','Machine-checked','Expert-reviewed','Validated'];

export const ValidationView:React.FC<{onOpenEntry?:(slug:string)=>void}>=({onOpenEntry})=> <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
  <SectionHeading eyebrow="Illustration validation" title="Figures must say what kind of evidence they are" lead="Orchid Continuum treats documentary images and explanatory illustrations differently. Authentic orchid imagery is preferred when it can communicate the concept accurately; AI-assisted scientific illustration is used when a photograph cannot adequately isolate, reconstruct, compare, or explain the required structure or process."/>
  <section className="mt-8 grid gap-4 md:grid-cols-5">{classes.map(([letter,title,body])=><article key={letter} className="rounded-sm border border-stone-200 bg-white p-4"><span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#6B3FA0]/10 font-serif text-xl text-[#6B3FA0]">{letter}</span><h2 className="mt-3 font-medium text-stone-900">{title}</h2><p className="mt-2 text-sm leading-relaxed text-stone-600">{body}</p></article>)}</section>

  <section className="mt-10 rounded-sm border border-stone-200 bg-white p-6">
    <h2 className="font-serif text-2xl text-stone-900" style={{fontFamily:'Georgia, serif'}}>Evidence-first illustration workflow</h2>
    <p className="mt-3 max-w-4xl text-sm leading-relaxed text-stone-700">The image generator is a rendering tool, not the scientific authority. Species-specific figures must be anchored to evidence for that taxon. Process diagrams — including photosynthesis, respiration, pollination, development, mycorrhizal biology, transport, and related mechanisms — must be derived from the scientific literature rather than generated from general model knowledge.</p>
    <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{workflow.map(([number,title,body])=><article key={number} className="rounded-sm bg-[#FDFBF6] p-4"><span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#4A7C59]">Step {number}</span><h3 className="mt-1 font-medium text-stone-900">{title}</h3><p className="mt-2 text-sm leading-relaxed text-stone-600">{body}</p></article>)}</div>
  </section>

  <section className="mt-10 rounded-sm border border-stone-200 bg-white p-6">
    <h2 className="font-serif text-2xl text-stone-900" style={{fontFamily:'Georgia, serif'}}>Scientific guardrails</h2>
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <article className="rounded-sm bg-[#FDFBF6] p-4"><h3 className="font-medium text-stone-900">Documentary versus explanatory imagery</h3><p className="mt-2 text-sm leading-relaxed text-stone-600">A photograph or specimen image documents an observed organism or object. An AI-assisted illustration or conceptual diagram is an evidence-based representation. The interface and metadata must never blur those categories.</p></article>
      <article className="rounded-sm bg-[#FDFBF6] p-4"><h3 className="font-medium text-stone-900">AI disclosure</h3><p className="mt-2 text-sm leading-relaxed text-stone-600">AI-assisted figures are explicitly labeled and are never represented as photographs or documentary specimen images. Preferred wording is “AI-assisted scientific illustration based on cited botanical references.”</p></article>
      <article className="rounded-sm bg-[#FDFBF6] p-4"><h3 className="font-medium text-stone-900">Measurement</h3><p className="mt-2 text-sm leading-relaxed text-stone-600">Absolute millimetre or centimetre measurements require a valid calibration reference. Without scale, only pixels, ratios, angles and relative descriptors may be reported.</p></article>
      <article className="rounded-sm bg-[#FDFBF6] p-4"><h3 className="font-medium text-stone-900">Colour and chemistry</h3><p className="mt-2 text-sm leading-relaxed text-stone-600">Observed colour phenotype must not be silently promoted to pigment chemistry. Inference and chemically verified pigment identity remain separate.</p></article>
      <article className="rounded-sm bg-[#FDFBF6] p-4"><h3 className="font-medium text-stone-900">Species reconstruction</h3><p className="mt-2 text-sm leading-relaxed text-stone-600">A species-specific synthetic figure should draw from properly identified photographs, taxonomic descriptions, diagnostic characters, specimen evidence, and measurements where available. A plausible-looking orchid is not sufficient.</p></article>
      <article className="rounded-sm bg-[#FDFBF6] p-4"><h3 className="font-medium text-stone-900">Processes and mechanisms</h3><p className="mt-2 text-sm leading-relaxed text-stone-600">Physiological, developmental, ecological and reproductive-process figures require literature review. Review articles may orient the work, but important mechanistic claims should be traced to primary literature where practicable.</p></article>
    </div>
  </section>

  <section className="mt-10 rounded-sm border border-[#6B3FA0]/20 bg-[#6B3FA0]/[.04] p-6">
    <h2 className="font-serif text-2xl text-stone-900" style={{fontFamily:'Georgia, serif'}}>Validation state is visible, not assumed</h2>
    <div className="mt-5 flex flex-wrap gap-2">{stages.map((stage,index)=><React.Fragment key={stage}><span className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700">{stage}</span>{index<stages.length-1&&<span aria-hidden className="self-center text-stone-400">→</span>}</React.Fragment>)}</div>
    <p className="mt-4 max-w-4xl text-sm leading-relaxed text-stone-700">Useful material may be published before final validation when its state and limitations are explicit. Machine checking, community review, expert review and scientific approval are separate events; missing review is shown as pending rather than inferred.</p>
  </section>

  <section className="mt-10 rounded-sm border border-[#4A7C59]/25 bg-[#4A7C59]/[.05] p-6"><h2 className="font-serif text-2xl text-stone-900" style={{fontFamily:'Georgia, serif'}}>Canonical Vision connection</h2><p className="mt-3 max-w-3xl text-sm leading-relaxed text-stone-700">The backend Vision-Lexicon service exposes reference sets, analyses, character observations, morphometric measurements, figure specifications, validation runs, review decisions and evidence summaries. This human-facing surface presents those governed contracts rather than creating a parallel validation database.</p>{onOpenEntry&&<button type="button" onClick={()=>onOpenEntry('resupination')} className="mt-5 rounded-sm bg-[#4A7C59] px-4 py-2 text-sm font-semibold text-white">See validation context on Resupination</button>}</section>
</div>;
