// @vitest-environment jsdom

/**
 * AppLayout renders the public homepage. It collapsed in production with
 * `ReferenceError: useState is not defined` — the component called useState
 * while importing only the React default, so every visitor saw the
 * RootErrorBoundary's "Something went wrong" instead of the homepage.
 *
 * Nothing caught it. The suite had four tests naming AppLayout, but all four
 * read it as *text*; none rendered it. `npm run build` is `vite build`, which
 * does not typecheck, and `tsc --noEmit` against the root tsconfig checks
 * nothing at all because that config is `"files": []` plus project references.
 *
 * This test renders the real tree, so an undefined identifier anywhere in the
 * homepage's own component surfaces as a failure here rather than in a browser.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ session: null }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// The homepage's sections fetch on mount. This test is about the layout
// rendering at all, so every request resolves to an empty, well-formed body:
// a section with no data must still not take the page down.
vi.stubGlobal(
  "fetch",
  vi.fn(async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })),
);

const { default: AppLayout } = await import("@/components/AppLayout");

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("AppLayout renders the public homepage", () => {
  it("mounts without throwing", () => {
    expect(() =>
      act(() => {
        root.render(
          <MemoryRouter initialEntries={["/"]}>
            <AppLayout />
          </MemoryRouter>,
        );
      }),
    ).not.toThrow();
  });

  it("produces real homepage content rather than an empty tree", () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={["/"]}>
          <AppLayout />
        </MemoryRouter>,
      );
    });
    expect(container.querySelector("main")).not.toBeNull();
    expect(container.textContent?.length ?? 0).toBeGreaterThan(200);
  });

  it("does not fall through to the root error boundary", () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={["/"]}>
          <AppLayout />
        </MemoryRouter>,
      );
    });
    expect(container.textContent).not.toContain("Something went wrong");
    expect(container.textContent).not.toContain("The page encountered an unexpected error");
  });
});
