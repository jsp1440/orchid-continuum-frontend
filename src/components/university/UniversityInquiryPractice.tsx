import { useEffect, useRef, useState } from 'react';
import type { UniversityLaboratory } from '@/lib/universityApi';
import { inquiryActivity } from '@/lib/universityInquiryContract';

type Response = { choice: string; note: string };

/** Backend-authored formative practice; never calls mutation, storage or model APIs. */
export default function UniversityInquiryPractice({ laboratory }: { laboratory: UniversityLaboratory }) {
  const [position, setPosition] = useState(0);
  const [selected, setSelected] = useState('');
  const [note, setNote] = useState('');
  const [responses, setResponses] = useState<Response[]>([]);
  const [checked, setChecked] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusRequested = useRef(false);
  useEffect(() => {
    if (focusRequested.current) {
      heading.current?.focus();
      focusRequested.current = false;
    }
  }, [position]);
  const activity = inquiryActivity(laboratory);
  if (!activity) {
    return <p role="status">Guided practice is unavailable for this backend content version.</p>;
  }
  const step = activity.steps[position];
  const choice = step?.choices.find((item) => item.id === selected);
  const complete = position === activity.steps.length;
  const buttonClass = 'rounded border border-emerald-200/50 px-4 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-200';

  return (
    <section aria-labelledby="inquiry-practice-title" className="rounded-2xl border border-emerald-200/30 p-7 text-white">
      <h2 id="inquiry-practice-title" className="font-serif text-2xl">Guided inquiry practice</h2>
      <p className="my-3 text-sm">Simulated instructional case. Deterministic feedback concerns reasoning, not a verified diagnosis or credential.</p>
      <p className="mb-5 text-sm">Responses stay in this page's memory. Leaving, reloading, losing release verification, or loading a different content version clears them. Nothing is saved, submitted or published.</p>
      {complete ? (
        <div>
          <h3 className="text-xl" tabIndex={-1} ref={heading}>Review your learning activity</h3>
          <p>Seven inquiry stages explored. This is a practice review, not scientific approval.</p>
          <ol className="my-4 space-y-4">
            {activity.steps.map((item, index) => {
              const response = responses[index];
              const answer = item.choices.find((candidate) => candidate.id === response?.choice);
              if (!answer) {
                return <li key={item.stage}>
                  <h4 className="font-semibold">{index + 1}. {item.stage}</h4>
                  <p role="alert">This response no longer matches the loaded content. Select "Start again" to restart practice.</p>
                  {response?.note && <p>Your note: {response.note}</p>}
                </li>;
              }
              return <li key={item.stage}>
                <h4 className="font-semibold">{index + 1}. {item.stage}</h4>
                <p>{answer.label}</p>
                <p>{answer.appropriate ? 'Appropriate reasoning' : 'Revisit this reasoning'}: {answer.feedback}</p>
                {response.note && <p>Your note: {response.note}</p>}
                <p className="text-sm">Scenario references: {item.evidence_ids.join(', ')}</p>
              </li>;
            })}
          </ol>
          <button type="button" className={buttonClass} onClick={() => {
            focusRequested.current = true;
            setPosition(0); setResponses([]); setSelected(''); setNote(''); setChecked(false);
          }}>Start again</button>
        </div>
      ) : (
        <div>
          <h3 className="text-xl" tabIndex={-1} ref={heading}>Stage {position + 1} of 7: {step.stage}</h3>
          <ul className="my-4 space-y-3" aria-label="Case evidence for this stage">
            {step.evidence_ids.map((id) => {
              const evidence = laboratory.evidence_catalog.find((item) => item.evidence_id === id)!;
              return <li key={id}><strong>{evidence.label}</strong> ({id}; {evidence.epistemic_status}): {evidence.summary}</li>;
            })}
          </ul>
          <fieldset className="space-y-3">
            <legend className="mb-3 font-semibold">{step.prompt}</legend>
            {step.choices.map((item) => <label key={item.id} className="flex items-start gap-3">
              <input type="radio" name="inquiry-choice" value={item.id}
                checked={selected === item.id} onChange={() => { setSelected(item.id); setChecked(false); }} />
              <span>{item.label}</span>
            </label>)}
          </fieldset>
          <label className="my-4 block" htmlFor="inquiry-note">Your question or hypothesis (optional, 2,000 characters maximum)</label>
          <textarea id="inquiry-note" maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)}
            className="block w-full rounded border border-white/30 bg-black/20 p-3 text-white" />
          <p className="my-2 text-sm">Notes are for your reflection. Automated feedback evaluates only the selected reasoning choice.</p>
          <button type="button" disabled={!choice} className={buttonClass} onClick={() => setChecked(true)}>Check reasoning</button>
          <div role="status" aria-live="polite" className="my-4">
            {checked && choice && <p>{choice.appropriate ? 'Appropriate reasoning. ' : 'Consider another approach. '}{choice.feedback}</p>}
          </div>
          {checked && choice && <button type="button" className={buttonClass} onClick={() => {
            focusRequested.current = true;
            setResponses([...responses, { choice: selected, note }]);
            setPosition(position + 1); setSelected(''); setNote(''); setChecked(false);
          }}>{position === 6 ? 'Review activity' : 'Next stage'}</button>}
        </div>
      )}
      <p className="mt-5 text-xs">Activity {activity.activity_id}, version {activity.version}. No live Calyx tutoring is invoked.</p>
    </section>
  );
}
