// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('@/components/orchid/PageShell', () => ({ default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/orchid/GetInvolved', () => ({ default: () => null }));
import GetInvolved from './GetInvolved';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('#679 keeps the unverified donation link disabled while participation remains usable', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    act(() => root.render(<MemoryRouter initialEntries={['/get-involved']}><Routes>
      <Route path="/get-involved" element={<GetInvolved />} />
      <Route path="/zoo" element={<p>Orchid Zoo</p>} />
    </Routes></MemoryRouter>));
    const buttons = Array.from(container.querySelectorAll('button'));
    const donate = buttons.find(button => button.textContent?.includes('Donations coming soon'))!;
    expect(donate.disabled).toBe(true);
    expect(container.querySelector('a[href*="ecologistics"]')).toBeNull();
    const volunteer = buttons.find(button => button.textContent?.includes('Open Orchid Zoo'))!;
    expect(volunteer.disabled).toBe(false);
    act(() => volunteer.click());
    expect(container.textContent).toBe('Orchid Zoo');
  } finally {
    act(() => root.unmount());
  }
});
