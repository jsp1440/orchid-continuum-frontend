import React, { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalyxApiError, createCalyxConversation, sendCalyxTurn } from '@/lib/calyxWorkspace';
import { readHomepageCalyxContext } from '@/lib/homepageCalyxContext';

const HomepageCalyxWorkspace: React.FC = () => {
  const context = useMemo(() => readHomepageCalyxContext(), []);
  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const subject = context?.active_species || context?.active_genus || 'this orchid';
  const prompts = [
    `What does the current map tell us about ${subject}?`,
    `What relationship evidence is available for ${subject}?`,
    `What do we not know yet about ${subject}?`,
  ];

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || submitting) return;
    setSubmitting(true); setError(null); setAnswer(null);
    try {
      let id = conversationId;
      if (!id) {
        const created = await createCalyxConversation({
          title: `Homepage · ${subject}`,
          project_id: 'public-homepage',
          context: { surface: 'homepage', page_context: context ?? undefined },
        });
        id = created.conversation_id; setConversationId(id);
      }
      const result = await sendCalyxTurn(id, {
        message: text,
        project_id: 'public-homepage',
        context: { surface: 'homepage', page_context: context ?? undefined },
        research_mode: 'auto',
        retrieval_limit: 12,
      });
      setAnswer(result.answer);
    } catch (err) {
      if (err instanceof CalyxApiError && err.kind === 'authentication_required') {
        setError('This Calyx conversation service currently requires sign-in. The page context has been preserved; sign in through Mission Control to continue.');
      } else {
        setError(err instanceof Error ? err.message : 'Calyx is temporarily unavailable.');
      }
    } finally { setSubmitting(false); }
  }

  return <main className="min-h-screen bg-[#0a170f] px-5 py-10 text-[#f5f0e8]">
    <div className="mx-auto max-w-3xl">
      <Link to="/" className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#d4b34a]">← Back to the orchid</Link>
      <h1 className="mt-5 font-serif text-4xl">Ask Calyx about {subject}</h1>
      <p className="mt-3 text-sm leading-6 text-[#d8cfbd]/80">Calyx receives the active orchid, Atlas theme, relationship scope, evidence states, provenance, and caveats from the page. Unsupported fields are omitted rather than invented.</p>

      <div className="mt-6 flex flex-wrap gap-2">{prompts.map((prompt) => <button key={prompt} type="button" onClick={() => setMessage(prompt)} className="rounded-full border border-[#d4b34a]/35 px-4 py-2 text-xs text-[#f5f0e8] hover:bg-[#d4b34a]/10">{prompt}</button>)}</div>

      <form onSubmit={submit} className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ask about the orchid, map, relationship, evidence, or gap…" className="min-h-28 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm outline-none" />
        <button disabled={!message.trim() || submitting} className="mt-3 rounded-full bg-[#d4b34a] px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#14281c] disabled:opacity-50">{submitting ? 'Calyx is working…' : 'Ask Calyx'}</button>
      </form>

      {answer && <div className="mt-6 rounded-2xl border border-[#d4b34a]/20 bg-white/[0.04] p-5"><p className="whitespace-pre-wrap text-sm leading-7">{answer}</p></div>}
      {error && <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm leading-6">{error}{error.includes('sign-in') && <div className="mt-3"><Link to="/mission-control" className="underline">Open Mission Control</Link></div>}</div>}

      {context && <details className="mt-6 rounded-xl border border-white/10 p-4 text-xs text-[#c9bfa9]"><summary className="cursor-pointer">Context Calyx receives</summary><pre className="mt-3 overflow-auto whitespace-pre-wrap">{JSON.stringify(context, null, 2)}</pre></details>}
    </div>
  </main>;
};

export default HomepageCalyxWorkspace;
