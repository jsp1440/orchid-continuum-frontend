// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const { default: ActiveDevelopmentBanner } = await import(
  '@/components/orchid/ActiveDevelopmentBanner'
);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  sessionStorage.removeItem('oc-dev-banner-dismissed');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  sessionStorage.removeItem('oc-dev-banner-dismissed');
});

function renderBanner() {
  act(() => {
    root.render(
      createElement(MemoryRouter, null, createElement(ActiveDevelopmentBanner)),
    );
  });
}

describe('ActiveDevelopmentBanner — PUBLIC-LAUNCH-001 (#679)', () => {
  it('renders the active-development notice', () => {
    renderBanner();
    const banner = container.querySelector('[data-testid="dev-banner"]');
    expect(banner).toBeTruthy();
    expect(banner!.textContent).toMatch(/Orchid Continuum is in active development/i);
  });

  it('renders the support CTA linking to /get-involved', () => {
    renderBanner();
    const cta = container.querySelector('[data-testid="dev-banner-donate-cta"]') as HTMLAnchorElement;
    expect(cta).toBeTruthy();
    expect(cta.getAttribute('href')).toBe('/get-involved');
  });

  it('does not use a bare external donation URL (owner-gated)', () => {
    renderBanner();
    const cta = container.querySelector('[data-testid="dev-banner-donate-cta"]') as HTMLAnchorElement;
    // href must be an internal route, not an absolute URL to an external service
    expect(cta.getAttribute('href')).not.toMatch(/^https?:\/\//);
  });

  it('dismisses the banner on dismiss-button click', () => {
    renderBanner();
    const btn = container.querySelector('[data-testid="dev-banner-dismiss"]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    act(() => btn.click());
    expect(container.querySelector('[data-testid="dev-banner"]')).toBeNull();
  });

  it('persists dismissed flag to sessionStorage', () => {
    renderBanner();
    act(() => {
      (container.querySelector('[data-testid="dev-banner-dismiss"]') as HTMLButtonElement).click();
    });
    expect(sessionStorage.getItem('oc-dev-banner-dismissed')).toBe('1');
  });

  it('does not render when already dismissed in sessionStorage', () => {
    sessionStorage.setItem('oc-dev-banner-dismissed', '1');
    renderBanner();
    expect(container.querySelector('[data-testid="dev-banner"]')).toBeNull();
  });

  it('exposes role="banner" for accessibility', () => {
    renderBanner();
    expect(container.querySelector('[role="banner"]')).toBeTruthy();
  });

  it('dismiss button has an accessible label', () => {
    renderBanner();
    const btn = container.querySelector('[data-testid="dev-banner-dismiss"]') as HTMLButtonElement;
    expect(btn.getAttribute('aria-label')).toBe('Dismiss active development notice');
  });

  it('banner exposes aria-live="polite" for screen-reader announcements', () => {
    renderBanner();
    const banner = container.querySelector('[data-testid="dev-banner"]');
    expect(banner!.getAttribute('aria-live')).toBe('polite');
  });
});
