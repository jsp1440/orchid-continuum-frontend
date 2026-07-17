import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CalendarClock, CheckCircle2, Inbox, Loader2, LockKeyhole, RefreshCw, Send, Workflow, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import UniversalFileIntake from '@/components/intelligence/UniversalFileIntake';
import { createOwnerSession } from '@/lib/ownerOperationsConsole';
import {
  createWorkflowAction,
  decideIntakeSource,
  fetchIntakeQueue,
  fetchIntakeSource,
  fetchSourceWorkflow,
  publishIntakeSource,
  submitIntakeText,
  type IntakeQueueItem,
  type IntakeSource,
  type WorkflowAction,
  type WorkflowActionType,
  type WorkflowPriority,
} from '@/lib/intakeApi';

const ROUTES: Array<{ type: WorkflowActionType; label: string; destination: string }> = [
  { type: 'TASK', label: 'My task', destination: 'owner_tasks' },
  { type: 'CALENDAR', label: 'Calendar / reminder', destination: 'calendar' },
  { type: 'GRANT', label: 'Grant Office', destination: 'grant_office' },
  { type: 'TAXONOMY_REVIEW', label: 'Taxonomy review', destination: 'taxonomy_review' },
  { type: 'LITERATURE_EXTRACTION', label: 'Literature extraction', destination: 'literature' },
  { type: 'PARTNERSHIP', label: 'Partnership follow-up', destination: 'partnerships' },
  { type: 'CONNECTOR_REVIEW', label: 'API / connector review', destination: 'integrations' },
  { type: 'MEDIA_SEARCH', label: 'Media search', destination: 'media' },
  { type: 'ARCHIVE', label: 'Archive', destination: 'archive' },
];

function toIso(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

export default function IntelligenceCenter() {
  const [accessCode, setAccessCode] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [queue, setQueue] = useState<IntakeQueueItem[]>([]);
  const [selected, setSelected] = useState<IntakeSource | null>(null);
  const [workflowActions, setWorkflowActions] = useState<WorkflowAction[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [actionType, setActionType] = useState<WorkflowActionType>('TASK');
  const [actionTitle, setActionTitle] = useState('');
  const [actionDescription, setActionDescription] = useState('');
  const [actionOwner, setActionOwner] = useState('Jeff Parham');
  const [actionPriority, setActionPriority] = useState<WorkflowPriority>('MEDIUM');
  const [dueAt, setDueAt] = useState('');
  const [reminderAt, setReminderAt] = useState('');

  const loadQueue = useCallback(async () => {
    setError('');
    try {
      const items = await fetchIntakeQueue();
      setQueue(items);
      setAuthenticated(true);
    } catch (err) {
      setAuthenticated(false);
      setError(err instanceof Error ? err.message : 'Unable to load intake queue.');
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  async function login() {
    setBusy(true);
    setError('');
    try {
      await createOwnerSession(accessCode, 'Jeff Parham');
      setAccessCode('');
      await loadQueue();
      setMessage('Owner session active.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }

  async function analyze() {
    if (!title.trim() || !content.trim()) {
      setError('Add both a title and research text before analyzing.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await submitIntakeText({ title: title.trim(), content: content.trim(), imported_by: 'Jeff Parham' });
      setMessage(result.duplicate ? 'This source was already captured.' : `Captured source #${result.id} for review.`);
      setTitle('');
      setContent('');
      await loadQueue();
      await openSource(result.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to analyze source.');
    } finally {
      setBusy(false);
    }
  }

  async function openSource(id: number) {
    setBusy(true);
    setError('');
    try {
      const detail = await fetchIntakeSource(id);
      setSelected(detail);
      setActionTitle(detail.title);
      setActionDescription('');
      try {
        const workflow = await fetchSourceWorkflow(id);
        setWorkflowActions(workflow.actions || []);
      } catch {
        setWorkflowActions([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load source.');
    } finally {
      setBusy(false);
    }
  }

  async function decide(action: 'approve' | 'reject') {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await decideIntakeSource(selected.id, action);
      setMessage(`Source #${selected.id} ${action === 'approve' ? 'approved and ready to route' : 'rejected'}.`);
      await loadQueue();
      if (action === 'approve') await openSource(selected.id);
      else setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update source.');
    } finally {
      setBusy(false);
    }
  }

  async function routeAction() {
    if (!selected || !actionTitle.trim()) return;
    const route = ROUTES.find((item) => item.type === actionType);
    if (!route) return;
    setBusy(true);
    setError('');
    try {
      const action = await createWorkflowAction(selected.id, {
        action_type: actionType,
        destination: route.destination,
        title: actionTitle.trim(),
        description: actionDescription.trim(),
        owner: actionOwner.trim(),
        priority: actionPriority,
        due_at: toIso(dueAt),
        reminder_at: toIso(reminderAt),
        notes: `Created from Intelligence Center source #${selected.id}`,
        metadata: { source_title: selected.title },
      });
      setWorkflowActions((current) => [action, ...current]);
      setMessage(`Created ${route.label} action #${action.id}.`);
      setActionDescription('');
      setDueAt('');
      setReminderAt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to route source.');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const result = await publishIntakeSource(selected.id);
      setMessage(result.message);
      setSelected(null);
      await loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to publish source.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#06110b] text-[#f5f0e8]">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 pb-20 pt-28 sm:px-6">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.22em] text-[#d4b34a]"><Inbox className="h-4 w-4" /> BUILD-073</div>
            <h1 className="text-4xl sm:text-5xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Intelligence Center</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#f5f0e8]/70">Capture evidence, approve it, and route the resulting work into grants, taxonomy, literature, partnerships, integrations, media, tasks, or calendar follow-up.</p>
          </div>
          <Link to="/mission-control" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm hover:border-[#d4b34a]/50"><ArrowLeft className="h-4 w-4" /> Mission Control</Link>
        </div>

        {error ? <div className="mb-5 rounded-lg border border-red-300/25 bg-red-300/10 p-4 text-sm text-red-100">{error}</div> : null}
        {message ? <div className="mb-5 rounded-lg border border-emerald-300/25 bg-emerald-300/10 p-4 text-sm text-emerald-100">{message}</div> : null}

        {!authenticated ? (
          <section className="mx-auto max-w-xl rounded-xl border border-white/10 bg-white/[0.04] p-6">
            <div className="flex items-center gap-3"><LockKeyhole className="h-5 w-5 text-[#d4b34a]" /><h2 className="text-2xl">Owner access</h2></div>
            <p className="mt-3 text-sm text-[#f5f0e8]/65">Enter the Mission Control owner access code.</p>
            <input type="password" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void login(); }} placeholder="Owner access code" className="mt-5 w-full rounded-lg border border-white/15 bg-black/25 px-4 py-3 outline-none focus:border-[#d4b34a]/60" />
            <button onClick={() => void login()} disabled={busy || !accessCode} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-5 py-3 font-semibold text-[#06110b] disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />} Open Intelligence Center</button>
          </section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-6">
              <UniversalFileIntake />
              <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
                <h2 className="text-2xl">New submission</h2>
                <p className="mt-2 text-sm text-[#f5f0e8]/60">Paste an article, email, report, AI briefing, or meeting notes.</p>
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Source title" className="mt-5 w-full rounded-lg border border-white/15 bg-black/25 px-4 py-3 outline-none focus:border-[#d4b34a]/60" />
                <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Paste research here..." rows={12} className="mt-3 w-full resize-y rounded-lg border border-white/15 bg-black/25 px-4 py-3 leading-6 outline-none focus:border-[#d4b34a]/60" />
                <button onClick={() => void analyze()} disabled={busy || !title.trim() || !content.trim()} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-5 py-3 font-semibold text-[#06110b] disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Analyze</button>
              </section>

              <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
                <div className="flex items-center justify-between gap-4"><div><h2 className="text-2xl">Review queue</h2><p className="mt-1 text-sm text-[#f5f0e8]/60">{queue.length} source{queue.length === 1 ? '' : 's'} available</p></div><button onClick={() => void loadQueue()} className="rounded-full border border-white/15 p-2 hover:border-[#d4b34a]/50" aria-label="Refresh queue"><RefreshCw className="h-4 w-4" /></button></div>
                <div className="mt-4 space-y-3">
                  {queue.length === 0 ? <p className="rounded-lg border border-dashed border-white/15 p-5 text-sm text-[#f5f0e8]/55">The review queue is empty.</p> : queue.map((item) => (
                    <button key={item.id} onClick={() => void openSource(item.id)} className="w-full rounded-lg border border-white/10 bg-black/20 p-4 text-left hover:border-[#d4b34a]/45">
                      <div className="flex items-start justify-between gap-4"><div><div className="font-semibold">{item.title}</div><div className="mt-1 text-xs uppercase tracking-wider text-[#f5f0e8]/45">#{item.id} · {item.source_type} · {item.status}</div></div><div className="text-right text-xs text-[#f5f0e8]/55"><div>{item.entity_count} entities</div><div>{item.task_count} tasks</div></div></div>
                    </button>
                  ))}
                </div>
              </section>
            </div>

            <section className="min-h-[620px] rounded-xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
              {!selected ? <div className="flex min-h-[560px] flex-col items-center justify-center text-center text-[#f5f0e8]/50"><Inbox className="mb-4 h-10 w-10" /><p>Select an intake source to inspect, approve, and route it.</p></div> : (
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-xs uppercase tracking-[0.18em] text-[#d4b34a]">Source #{selected.id}</div><h2 className="mt-2 text-2xl">{selected.title}</h2><div className="mt-1 text-xs text-[#f5f0e8]/45">{selected.status} · {selected.parser_version}</div></div><button onClick={() => setSelected(null)} className="text-sm text-[#f5f0e8]/55">Close</button></div>
                  <div className="mt-5 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/25 p-4 text-sm leading-6 text-[#f5f0e8]/75">{selected.raw_content}</div>

                  <h3 className="mt-6 font-semibold">Extracted entities ({selected.entities?.length || 0})</h3>
                  <div className="mt-3 max-h-44 space-y-2 overflow-auto">{(selected.entities || []).map((entity) => <div key={entity.id} className="rounded-lg border border-white/10 p-3"><div className="flex justify-between gap-3"><span>{entity.canonical_name}</span><span className="text-xs text-[#d4b34a]">{Math.round(entity.confidence * 100)}%</span></div><div className="mt-1 text-xs uppercase tracking-wider text-[#f5f0e8]/45">{entity.entity_type}</div></div>)}</div>

                  <h3 className="mt-6 font-semibold">Generated tasks ({selected.tasks?.length || 0})</h3>
                  <div className="mt-3 space-y-2">{(selected.tasks || []).map((task) => <div key={task.id} className="rounded-lg border border-white/10 p-3"><div>{task.title}</div><div className="mt-1 text-xs uppercase tracking-wider text-[#f5f0e8]/45">{task.priority} · {task.status}</div></div>)}</div>

                  <div className="mt-7 flex flex-wrap gap-3">
                    {selected.status === 'REVIEW' ? <><button onClick={() => void decide('approve')} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-emerald-300 px-4 py-2 font-semibold text-[#06110b]"><CheckCircle2 className="h-4 w-4" /> Approve</button><button onClick={() => void decide('reject')} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-red-300/40 px-4 py-2 text-red-100"><XCircle className="h-4 w-4" /> Reject</button></> : null}
                  </div>

                  {selected.status === 'APPROVED' ? (
                    <div className="mt-7 rounded-xl border border-[#d4b34a]/25 bg-[#d4b34a]/[0.05] p-4">
                      <div className="flex items-center gap-2"><Workflow className="h-5 w-5 text-[#d4b34a]" /><h3 className="text-xl">Approve and Route</h3></div>
                      <p className="mt-2 text-sm text-[#f5f0e8]/60">Create one or more durable actions from this approved source.</p>
                      <select value={actionType} onChange={(event) => setActionType(event.target.value as WorkflowActionType)} className="mt-4 w-full rounded-lg border border-white/15 bg-[#06110b] px-3 py-3">
                        {ROUTES.map((route) => <option key={route.type} value={route.type}>{route.label}</option>)}
                      </select>
                      <input value={actionTitle} onChange={(event) => setActionTitle(event.target.value)} placeholder="Action title" className="mt-3 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-3" />
                      <textarea value={actionDescription} onChange={(event) => setActionDescription(event.target.value)} placeholder="What needs to happen?" rows={3} className="mt-3 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-3" />
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input value={actionOwner} onChange={(event) => setActionOwner(event.target.value)} placeholder="Owner" className="rounded-lg border border-white/15 bg-black/25 px-3 py-3" />
                        <select value={actionPriority} onChange={(event) => setActionPriority(event.target.value as WorkflowPriority)} className="rounded-lg border border-white/15 bg-[#06110b] px-3 py-3"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select>
                        <label className="text-xs text-[#f5f0e8]/55">Due date<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-3 text-sm" /></label>
                        <label className="text-xs text-[#f5f0e8]/55">Reminder<input type="datetime-local" value={reminderAt} onChange={(event) => setReminderAt(event.target.value)} className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-3 text-sm" /></label>
                      </div>
                      <button onClick={() => void routeAction()} disabled={busy || !actionTitle.trim()} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-4 py-2 font-semibold text-[#06110b] disabled:opacity-50">{actionType === 'CALENDAR' ? <CalendarClock className="h-4 w-4" /> : <Workflow className="h-4 w-4" />} Create action</button>

                      {workflowActions.length > 0 ? <div className="mt-5"><h4 className="font-semibold">Routed actions ({workflowActions.length})</h4><div className="mt-2 space-y-2">{workflowActions.map((action) => <div key={action.id} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm"><div className="font-semibold">{action.title}</div><div className="mt-1 text-xs uppercase tracking-wider text-[#f5f0e8]/45">{action.action_type} · {action.priority} · {action.status}</div></div>)}</div></div> : null}

                      <button onClick={() => void publish()} disabled={busy} className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm"><CheckCircle2 className="h-4 w-4" /> Publish intake package</button>
                    </div>
                  ) : null}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
