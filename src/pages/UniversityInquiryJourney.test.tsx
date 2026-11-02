// @vitest-environment jsdom
import React, { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { universityApi, type UniversityChapter, type UniversityLaboratory } from '@/lib/universityApi';
import type { UniversityReleaseReadiness } from '@/lib/universityRelease';
import captured from '@/lib/__fixtures__/universityInquiry.backend.json';
import UniversityLabPrototype from './UniversityLabPrototype';

vi.mock('@/lib/backendConfig', () => ({ CALYX_BACKEND_BASE_URL: 'https://backend.test' }));
vi.mock('@/components/orchid/PageShell', () => ({
  default: ({ children, showDemoBanner }: { children: React.ReactNode; showDemoBanner?: boolean }) =>
    <main>{showDemoBanner !== false && <p>Live data · Orchid Continuum + GBIF</p>}{children}</main>,
}));
vi.mock('@/components/university/UniversityLearnerNotebook', () => ({
  default: () => <div>Durable learner notebook</div>,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
const laboratory = captured.laboratory as UniversityLaboratory;
const capability = {
  enabled: true, session_writes_enabled: false, learner_auth_enabled: false,
  durable_sessions_enabled: false, persistence: 'process_local_memory' as const,
  publication_enabled: false, candidate_knowledge_writes_enabled: false, calyx_model_calls_enabled: false,
};
const readiness = {
  release_contract: 'OCU-RELEASE-003', university_enabled: true, read_only_ready: true,
  session_writes_enabled: false, durable_sessions_enabled: false, persistence: 'process_local_memory',
  publication_enabled: false, candidate_knowledge_writes_enabled: false, calyx_model_calls_enabled: false,
  human_review_required: true,
} as UniversityReleaseReadiness;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(universityApi, 'releaseReadiness').mockResolvedValue(readiness);
  vi.spyOn(universityApi, 'capability').mockResolvedValue(capability);
  vi.spyOn(universityApi, 'catalog').mockResolvedValue({
    chapter: { id: captured.chapter.chapter_id, ...captured.chapter },
    laboratory: { id: laboratory.laboratory_id, ...laboratory }, capability,
  });
  vi.spyOn(universityApi, 'chapter').mockResolvedValue(captured.chapter as UniversityChapter);
  vi.spyOn(universityApi, 'laboratory').mockResolvedValue(laboratory);
});
afterEach(() => {
  act(() => root.unmount());
  client.clear(); container.remove(); vi.restoreAllMocks();
});
async function mount() {
  await act(async () => {
    root.render(<StrictMode><QueryClientProvider client={client}><UniversityLabPrototype /></QueryClientProvider></StrictMode>);
  });
  for (let i = 0; i < 10; i++) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
  }
}
function button(label: string) {
  const node = [...container.querySelectorAll('button')].find((item) => item.textContent === label);
  if (!node) throw new Error('Missing button: ' + label);
  return node;
}

describe('existing flowering lesson to ephemeral inquiry practice', () => {
  it('walks all seven stages, explains mistakes, reviews responses and never writes', async () => {
    const writes = [
      vi.spyOn(universityApi, 'createSession'), vi.spyOn(universityApi, 'appendEvent'),
      vi.spyOn(universityApi, 'submitSession'),
    ];
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected request'));
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    await mount();
    expect(container.textContent).toContain(captured.chapter.title);
    expect(container.textContent).toContain('not verified observations');
    expect(container.textContent).not.toContain('Live data');
    expect(container.textContent).not.toContain('Durable learner notebook');
    for (let stage = 0; stage < 7; stage++) {
      expect(container.textContent).toContain('Stage ' + (stage + 1) + ' of 7');
      expect(button('Check reasoning').disabled).toBe(true);
      const options = container.querySelectorAll<HTMLInputElement>('input[type="radio"]');
      act(() => options[1].click());
      act(() => button('Check reasoning').click());
      expect(container.textContent).toContain('Consider another approach.');
      act(() => options[0].click());
      expect(container.textContent).not.toContain('Consider another approach.');
      act(() => button('Check reasoning').click());
      expect(container.textContent).toContain('Appropriate reasoning.');
      act(() => button(stage === 6 ? 'Review activity' : 'Next stage').click());
    }
    expect(container.textContent).toContain('Review your learning activity');
    expect(container.querySelectorAll('ol li')).toHaveLength(7);
    expect(container.textContent).toContain('not scientific approval');
    for (const write of writes) expect(write).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    act(() => button('Start again').click());
    expect(container.textContent).toContain('Stage 1 of 7');
    expect(container.querySelectorAll('ol li')).toHaveLength(0);
  });

  it('recovers when same-version refreshed content removes a completed response choice', async () => {
    await mount();
    for (let stage = 0; stage < 7; stage++) {
      act(() => container.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
      act(() => button('Check reasoning').click());
      act(() => button(stage === 6 ? 'Review activity' : 'Next stage').click());
    }
    expect(container.textContent).toContain('Review your learning activity');
    const refreshed = structuredClone(laboratory);
    refreshed.inquiry_activity!.steps[0].choices[0].id = 'refreshed-observe-choice';
    expect(refreshed.inquiry_activity!.version).toBe(laboratory.inquiry_activity!.version);
    vi.mocked(universityApi.laboratory).mockResolvedValue(refreshed);
    await act(async () => { await client.refetchQueries({ queryKey: ['university-laboratory'] }); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    expect(container.textContent).toContain('response no longer matches');
    act(() => button('Start again').click());
    expect(container.textContent).toContain('Stage 1 of 7');
    expect(container.querySelectorAll('ol li')).toHaveLength(0);
    expect(container.querySelector<HTMLInputElement>('input[type="radio"]')!.value).toBe('refreshed-observe-choice');
    expect(container.querySelector('textarea')!.value).toBe('');
  });

  it('keeps practice and content closed when release contracts disagree', async () => {
    vi.mocked(universityApi.capability).mockResolvedValue({ ...capability, session_writes_enabled: true });
    await mount();
    expect(container.textContent).toContain('do not agree');
    expect(universityApi.catalog).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('Guided inquiry practice');
  });

  it('keeps free-text focus while editing and clears notes on remount', async () => {
    await mount();
    const textarea = container.querySelector('textarea')!;
    textarea.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(textarea, 'What comparison would weaken my hypothesis?');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(document.activeElement).toBe(textarea);
    expect(textarea.value).toContain('weaken my hypothesis');
    expect(textarea.maxLength).toBe(2000);
    expect(container.textContent).toContain('evaluates only the selected reasoning choice');
    act(() => root.unmount());
    root = createRoot(container);
    await mount();
    expect(container.querySelector('textarea')!.value).toBe('');
  });

  it('reports content-fetch failure explicitly', async () => {
    vi.mocked(universityApi.chapter).mockRejectedValue(new Error('Chapter unavailable'));
    await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('lesson content is unavailable');
    expect(container.textContent).not.toContain('Guided inquiry practice');
  });

  it('does not invent practice when an older backend lacks the activity', async () => {
    vi.mocked(universityApi.laboratory).mockResolvedValue({ ...laboratory, inquiry_activity: undefined });
    await mount();
    expect(container.textContent).toContain('Guided practice is unavailable');
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(0);
  });

  it('fails closed on a broken case evidence reference', async () => {
    const broken = structuredClone(laboratory);
    broken.inquiry_activity!.steps[0].evidence_ids = ['UNKNOWN'];
    vi.mocked(universityApi.laboratory).mockResolvedValue(broken);
    await mount();
    expect(container.textContent).toContain('Guided practice is unavailable');
  });

  it('does not steal focus on asynchronous initial mount and focuses an explicit stage change', async () => {
    const sentinel = document.createElement('button');
    document.body.appendChild(sentinel);
    sentinel.focus();
    await mount();
    expect(document.activeElement).toBe(sentinel);
    act(() => container.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
    act(() => button('Check reasoning').click());
    act(() => button('Next stage').click());
    expect(document.activeElement?.textContent).toBe('Stage 2 of 7: question');
    sentinel.remove();
  });

  it('preserves notes and selected reasoning when a background content refresh fails', async () => {
    await mount();
    const textarea = container.querySelector('textarea')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(textarea, 'Keep this learner hypothesis');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      container.querySelector<HTMLInputElement>('input[type="radio"]')!.click();
    });
    act(() => button('Check reasoning').click());
    vi.mocked(universityApi.chapter).mockRejectedValue(new Error('Refresh failed'));
    await act(async () => { await client.refetchQueries({ queryKey: ['university-chapter'] }); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    expect(container.textContent).toContain('lesson refresh failed');
    expect(container.querySelector('textarea')!.value).toBe('Keep this learner hypothesis');
    expect(container.querySelector<HTMLInputElement>('input[type="radio"]')!.checked).toBe(true);
    expect(container.textContent).toContain('Appropriate reasoning.');
    act(() => button('Next stage').click());
    for (let stage = 1; stage < 7; stage++) {
      act(() => container.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
      act(() => button('Check reasoning').click());
      act(() => button(stage === 6 ? 'Review activity' : 'Next stage').click());
    }
    expect(container.textContent).toContain('Your note: Keep this learner hypothesis');
  });

  it.each([
    ['missing steps', (value: Record<string, unknown>) => { delete value.steps; }],
    ['null choices', (value: Record<string, unknown>) => { (value.steps as Record<string, unknown>[])[0].choices = null; }],
    ['string truth value', (value: Record<string, unknown>) => {
      const step = (value.steps as Record<string, unknown>[])[0];
      (step.choices as Record<string, unknown>[])[0].appropriate = 'false';
    }],
    ['missing version', (value: Record<string, unknown>) => { delete value.version; }],
    ['unsupported version', (value: Record<string, unknown>) => { value.version = '999.0.0'; }],
    ['duplicate choice ids', (value: Record<string, unknown>) => {
      const choices = ((value.steps as Record<string, unknown>[])[0].choices as Record<string, unknown>[]);
      choices[1].id = choices[0].id;
    }],
  ])('shows unavailable instead of crashing or trusting %s', async (_label, change) => {
    const broken = structuredClone(laboratory);
    change(broken.inquiry_activity as unknown as Record<string, unknown>);
    vi.mocked(universityApi.laboratory).mockResolvedValue(broken);
    await mount();
    expect(container.textContent).toContain('Guided practice is unavailable');
    expect(container.querySelector('input[type="radio"]')).toBeNull();
  });

  it('rejects jointly corrupted stage sequences', async () => {
    const broken = structuredClone(laboratory);
    broken.inquiry_sequence[1] = 'observe';
    broken.inquiry_activity!.steps[1].stage = 'observe';
    vi.mocked(universityApi.laboratory).mockResolvedValue(broken);
    await mount();
    expect(container.textContent).toContain('Guided practice is unavailable');
  });

  it('fails closed and discloses clearing notes when safety verification is lost', async () => {
    await mount();
    const textarea = container.querySelector('textarea')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(textarea, 'Unsaved learner note');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    vi.mocked(universityApi.releaseReadiness).mockRejectedValue(new Error('Cannot verify release'));
    await act(async () => { await client.refetchQueries({ queryKey: ['university-release-readiness'] }); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    expect(container.textContent).toContain('losing release verification clears unsaved practice');
    expect(container.querySelector('textarea')).toBeNull();
    vi.mocked(universityApi.releaseReadiness).mockResolvedValue(readiness);
    await act(async () => { await client.refetchQueries({ queryKey: ['university-release-readiness'] }); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    expect(container.querySelector('textarea')!.value).toBe('');
  });
});
