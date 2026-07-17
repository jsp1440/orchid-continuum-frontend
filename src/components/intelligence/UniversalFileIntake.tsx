import { useRef, useState } from 'react';
import { FileUp, Loader2, Trash2 } from 'lucide-react';
import { uploadIntakeBatch, type BatchUploadResult } from '@/lib/intakeApi';

export default function UniversalFileIntake() {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [batchName, setBatchName] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<BatchUploadResult | null>(null);
  const [error, setError] = useState('');

  function add(selected: FileList | null) {
    if (!selected) return;
    setFiles((current) => [...current, ...Array.from(selected).filter((file) => !current.some((item) => item.name === file.name && item.size === file.size))]);
  }

  async function upload() {
    setUploading(true); setError(''); setResult(null);
    try {
      const response = await uploadIntakeBatch({ displayName: batchName.trim(), sourceLabel: sourceLabel.trim() || undefined, files });
      setResult(response); setFiles([]); if (input.current) input.current.value = '';
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Upload failed.'); }
    finally { setUploading(false); }
  }

  return <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
    <div className="flex items-center gap-3"><FileUp className="h-5 w-5 text-[#d4b34a]"/><div><h2 className="text-2xl">Upload files</h2><p className="mt-1 text-sm text-[#f5f0e8]/60">Choose many files from iPad Files or desktop. Originals are retained for review.</p></div></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2"><input aria-label="Batch name" value={batchName} onChange={(event) => setBatchName(event.target.value)} placeholder="Batch name" className="rounded-lg border border-white/15 bg-black/25 px-4 py-3"/><input aria-label="Source label" value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} placeholder="Source label (optional)" className="rounded-lg border border-white/15 bg-black/25 px-4 py-3"/></div>
    <label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); add(event.dataTransfer.files); }} className="mt-4 flex min-h-28 cursor-pointer touch-manipulation flex-col items-center justify-center rounded-xl border border-dashed border-[#d4b34a]/40 bg-black/20 p-5 text-center">
      <span className="font-semibold">Choose files</span><span className="mt-1 text-xs text-[#f5f0e8]/55">Multi-select supported; desktop users can also drop files here.</span>
      <input ref={input} className="sr-only" type="file" multiple onChange={(event) => add(event.target.files)} accept=".pdf,.docx,.txt,.md,.csv,.json,.xlsx,.png,.jpg,.jpeg,.webp,.gif,.zip"/>
    </label>
    {files.length > 0 && <div className="mt-4 space-y-2" aria-live="polite">{files.map((file, index) => <div key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 p-3 text-sm"><span className="min-w-0 truncate">{file.name} <span className="text-[#f5f0e8]/45">({Math.ceil(file.size / 1024)} KB)</span></span><button aria-label={`Remove ${file.name}`} className="min-h-11 min-w-11 rounded-full border border-white/15 p-3" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4"/></button></div>)}</div>}
    <button onClick={() => void upload()} disabled={uploading || !batchName.trim() || files.length === 0} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#d4b34a] px-5 py-3 font-semibold text-[#06110b] disabled:opacity-50">{uploading ? <Loader2 className="h-4 w-4 animate-spin"/> : <FileUp className="h-4 w-4"/>}{uploading ? `Uploading ${files.length} files…` : `Upload ${files.length || ''} file${files.length === 1 ? '' : 's'}`}</button>
    {error && <p className="mt-4 rounded-lg border border-red-300/25 bg-red-300/10 p-3 text-sm text-red-100">{error}</p>}
    {result && <div className="mt-4 rounded-lg border border-emerald-300/25 bg-emerald-300/10 p-4 text-sm" aria-live="polite"><p>Batch #{result.batch.id}: {result.batch.accepted_count} preserved, {result.batch.duplicate_count} duplicates, {result.batch.failed_count} failed.</p>{result.files.filter((item) => item.status === 'FAILED').map((item) => <p key={item.filename} className="mt-2 text-red-100">{item.filename}: {item.error}</p>)}</div>}
  </section>;
}
