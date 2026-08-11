import { FormEvent, useMemo, useState } from 'react';

import { askCalyx, type CalyxResponse } from '@/lib/calyxService';

export function MatrixCalyxChat({ sourceConcept, sourceLabel }: { sourceConcept?: string; sourceLabel?: string }) {
  const contextLabel = sourceLabel || sourceConcept || 'the current identification matrix';
  const suggestions = useMemo(
    () => [
      `Which observations are most discriminating in ${contextLabel}?`,
      `What should I inspect next to distinguish the leading candidates?`,
      `Which current observations are weak, uncertain, or missing?`,
      sourceConcept
        ? `How does ${contextLabel} relate to the characters in this identification?`
        : 'How should I interpret match score versus coverage?',
    ],
    [contextLabel, sourceConcept],
  );
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<CalyxResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function ask(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    setQuestion(trimmed);
    try {
      setAnswer(
        await askCalyx({
          concept: sourceConcept || 'matrix-identification',
          question: trimmed,
          surface: 'matrix-identification',
          module: 'matrix-identification',
          context: {
            current_concept_label: sourceLabel,
            context_is_observation: false,
            identification_result_is_verified: false,
          },
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calyx request failed');
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <section className="rounded-2xl border bg-card p-5" aria-label="Speak with Calyx about matrix identification">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Speak with Calyx</p>
      <h2 className="mt-1 text-xl font-semibold">Identification conversation</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This continues the same adaptive Calyx session used by the lexicon. Interface context helps resolve references but is not evidence, and candidate rankings are not verified identifications.
      </p>

      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2.5 text-sm"
          placeholder="Ask Calyx about these characters or candidates…"
        />
        <button type="submit" disabled={loading} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {loading ? 'Consulting…' : 'Ask'}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button key={suggestion} type="button" onClick={() => void ask(suggestion)} className="rounded-full border px-3 py-1.5 text-left text-xs hover:bg-muted">
            {suggestion}
          </button>
        ))}
      </div>

      <div className="mt-4" aria-live="polite">
        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {loading && <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">Consulting the governed Calyx conversation…</p>}
        {!loading && answer && (
          <article className="rounded-xl border bg-background p-4">
            <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              {answer.provider && <span>{answer.provider}{answer.provider_model ? ` · ${answer.provider_model}` : ''}</span>}
              {answer.confidence_or_review_state && <span>· {answer.confidence_or_review_state}</span>}
            </div>
            <h3 className="mt-2 font-semibold">{answer.question}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{answer.concise_answer}</p>
            {answer.uncertainty && <p className="mt-3 border-l-2 border-amber-500 pl-3 text-xs text-muted-foreground">{answer.uncertainty}</p>}
          </article>
        )}
      </div>
    </section>
  );
}
