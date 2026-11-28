import { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import { readPublicTraversal, type Traversal, type TraversalEdge } from '@/lib/publicTraversal';

const INITIAL_NODE = 41908;
const empty: Traversal = { nodes: [], edges: [], truncated: false };

export default function PublicTraversalExplorer() {
  const canvas = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState(INITIAL_NODE);
  const [graph, setGraph] = useState(empty);
  const [message, setMessage] = useState('Loading graph relationships…');
  const [selected, setSelected] = useState<TraversalEdge>();
  useEffect(() => {
    const controller = new AbortController();
    setMessage('Loading graph relationships…');
    readPublicTraversal(root, controller.signal).then(page => {
      if (controller.signal.aborted) return;
      setGraph(previous => {
        const nodes = [...new Map([...previous.nodes, ...page.nodes].map(n => [n.id, n])).values()].slice(0, 60);
        const ids = new Set(nodes.map(n => n.id));
        const edges = [...new Map([...previous.edges, ...page.edges].map(e => [e.id, e])).values()].filter(e => ids.has(e.from) && ids.has(e.to)).slice(0, 120);
        return { nodes, edges, truncated: previous.truncated || page.truncated || nodes.length >= 60 || edges.length >= 120 };
      });
      setMessage(page.edges.length ? 'Select a node to expand it or a relationship to inspect its source.' : 'This read returned no outgoing links of the displayed types.');
    }).catch(() => { if (!controller.signal.aborted) setMessage('Graph read unavailable. Previously loaded relationships remain visible.'); });
    return () => controller.abort();
  }, [root]);
  useEffect(() => {
    if (!canvas.current || !graph.nodes.length) return;
    const cy = cytoscape({
      container: canvas.current,
      elements: [
        ...graph.nodes.map(n => ({ data: { id: String(n.id), label: n.label, type: n.type } })),
        ...graph.edges.map(e => ({ data: { id: `edge-${e.id}`, source: String(e.from), target: String(e.to) } })),
      ],
      layout: { name: 'cose', animate: false, padding: 28, nodeRepulsion: () => 14000 },
      style: [
        { selector: 'node', style: { label: 'data(label)', 'font-size': 11, 'background-color': '#315e45', color: '#24321f', 'text-background-color': '#fffaf0', 'text-background-opacity': 1 } },
        { selector: 'node[type="organism"]', style: { 'background-color': '#79578b' } },
        { selector: 'node[type="genus"]', style: { 'background-color': '#a67537' } },
        { selector: 'edge', style: { width: 3, 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'target-arrow-color': '#597777', 'line-color': '#597777' } },
      ],
    });
    cy.on('tap', 'node', e => setRoot(Number(e.target.id())));
    cy.on('tap', 'edge', e => setSelected(graph.edges.find(link => `edge-${link.id}` === e.target.id())));
    return () => { cy.destroy(); };
  }, [graph]);
  const label = (id: number) => graph.nodes.find(n => n.id === id)?.label;
  return <section aria-labelledby="typed-network-title" className="mb-9">
    <h2 id="typed-network-title" className="font-serif text-3xl">Explore the evidence network</h2>
    <p className="my-2">Start at <i>Epidendrum secundum</i> and follow public taxonomy or fungal-association links. Each selection reads up to twelve outgoing relationships.</p>
    <p role="status" className="my-2">{message}</p>
    {graph.truncated && <p>Only a bounded portion of the graph is displayed.</p>}
    <div ref={canvas} className="h-72 rounded-lg bg-[#fffaf0]" aria-hidden="true" />
    <details open className="mt-3"><summary>Expand a node</summary>
      <div className="mt-2 flex flex-wrap gap-2">{graph.nodes.map(n => <button type="button" key={n.id} className="rounded border border-stone-500 px-2 py-1" onClick={() => setRoot(n.id)}>{n.label}</button>)}</div>
    </details>
    <details open className="mt-3"><summary>Inspect a relationship</summary>
      <ul>{graph.edges.map(e => <li key={e.id}><button type="button" className="py-1 text-left underline" onClick={() => setSelected(e)}>{label(e.from)} → {e.predicate.replaceAll('_', ' ')} → {label(e.to)}</button></li>)}</ul>
    </details>
    {selected && <p className="mt-2 rounded border border-stone-400 p-3" role="status">Graph edge {selected.id} · {selected.predicate} · {selected.source} record {selected.record}. {selected.doi && <a className="underline" href={`https://doi.org/${selected.doi}`}>DOI {selected.doi}</a>}</p>}
  </section>;
}
