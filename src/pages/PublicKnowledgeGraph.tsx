import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import DailyGenusGraphEvidence from '@/components/orchid/DailyGenusGraphEvidence';

const guide = [
  { title: 'Taxonomy and ontology', body: 'A genus groups related species. A graph node represents an entity such as a taxon or paper. A typed edge records how two entities are related. Check the accepted name and its synonyms when comparing sources.', label: 'Browse species', to: '/species' },
  { title: 'Scientific sources', body: 'World Plants supplies nomenclatural context, GBIF provides occurrence records, and primary literature can document ecological interactions. Check the identifier, licence and attribution on each source record.', label: 'Explore the Atlas', to: '/atlas' },
  { title: 'Architecture and federation', body: 'This explorer requests a bounded two-hop traversal from the Calyx graph service. It displays the returned coverage by domain. External source availability and graph coverage can differ.', label: 'Read the graph client', to: 'https://github.com/jsp1440/orchid-continuum-frontend/blob/main/src/lib/knowledgeGraph.ts' },
  { title: 'Reasoning with Calyx', body: 'Start with a genus and ask which sources support a relationship. Compare the botanical names, the study methods and the uncertainty before drawing a conclusion.', label: 'Meet Calyx', to: '/calyx' },
  { title: 'Scientific governance', body: 'Canonical taxonomy changes and publication require human review. Treat conflicting identifications as competing claims until their source material has been checked. Public locality displays are limited to broad regions.', label: 'Review literature', to: '/review' },
  { title: 'Observatory', body: 'The explorer reports whether its read succeeded, returned a partial traversal, found no genus record, or could not retrieve evidence. Authorized members can inspect operational readiness.', label: 'Open readiness dashboard (sign-in required)', to: '/mission-control/knowledge-graph-readiness' },
  { title: 'Research and developer resources', body: 'Darwin Core defines biodiversity record terms. PROV-O describes provenance and SHACL expresses RDF validation constraints. These are reference standards for interpreting and exchanging evidence.', label: 'Read the Darwin Core terms', to: 'https://dwc.tdwg.org/terms/' },
  { title: 'Contribute evidence', body: 'Bring a citation, a stable record identifier, and the name as published. Explain what the source actually documents and which identification or interpretation needs review.', label: 'Get involved', to: '/get-involved' },
];

export default function PublicKnowledgeGraph() {
  const [input, setInput] = useState('Cattleya');
  const [genus, setGenus] = useState('Cattleya');
  function explore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (input.trim()) setGenus(input.trim());
  }
  return (
    <div className="min-h-screen bg-[#f6f0df] text-[#24321f]">
      <Navbar />
      <main className="mx-auto max-w-6xl px-5 pb-16 pt-28">
        <Link to="/" className="underline">Orchid Continuum home</Link>
        <h1 className="mt-5 font-serif text-5xl">Knowledge Graph</h1>
        <p className="mt-4 max-w-2xl text-lg">Follow an orchid name into its recorded scientific relationships. Explore published graph coverage, then inspect the source and the scope of each claim.</p>
        <section id="explorer" className="my-10" aria-labelledby="explorer-title">
          <h2 id="explorer-title" className="font-serif text-3xl">Explore a genus</h2>
          <form onSubmit={explore} className="my-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">Genus name
              <input value={input} onChange={event => setInput(event.target.value)} required maxLength={80} pattern="[A-Za-z]+" className="rounded border border-stone-500 bg-white px-3 py-2" />
            </label>
            <button className="rounded bg-[#254631] px-4 py-2 text-white">Read graph</button>
          </form>
          <DailyGenusGraphEvidence key={genus} genus={genus} />
          <Link className="mt-3 inline-block underline" to={`/genus/${encodeURIComponent(genus)}`}>Open the {genus} genus profile</Link>
        </section>
        <section className="mb-9 rounded-lg border border-stone-400 p-5">
          <h2 className="font-serif text-2xl">Which fungi were studied with <i>Epidendrum secundum</i>?</h2>
          <p className="my-2 leading-relaxed">On 28 November 2026, a one-hop read of orchid taxon 8104 returned two fungal associations, <i>Ceratobasidium</i> and <i>Sebacina vermifera</i>. Graph edges 337340 and 337341 cite the same study of germination and seedling growth. They represent two associations from one source. Their scope is the study conditions.</p>
          <div className="flex flex-wrap gap-4 underline">
            <a href="https://orchid-calyx-backend.onrender.com/api/knowledge-graph/taxon/8104?depth=1&amp;limit=12">Repeat the graph read (JSON)</a>
            <a href="https://doi.org/10.1016/j.sajb.2019.06.029">Read the cited study</a>
            <Link to="/species/Epidendrum%20secundum">Open the species dossier</Link>
          </div>
        </section>
        <div className="grid gap-x-10 gap-y-7 md:grid-cols-2">
          {guide.map(section => (
            <section key={section.title} className="border-t border-stone-400 pt-4">
              <h2 className="font-serif text-2xl">{section.title}</h2>
              <p className="my-2 max-w-prose leading-relaxed">{section.body}</p>
              {section.to.startsWith('https:') ? <a href={section.to} className="underline">{section.label}</a> : <Link to={section.to} className="underline">{section.label}</Link>}
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
