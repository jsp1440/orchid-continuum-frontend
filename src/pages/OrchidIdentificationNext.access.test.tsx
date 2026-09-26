// @vitest-environment jsdom

/**
 * J4 (Release 1): what the guided Matrix page shows when Matrix is refused or
 * unavailable. Matrix is owner-only on the backend today; this pins the copy,
 * not the access rule. Errors are produced by the real MatrixApiError class.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import realBackend from "@/lib/__fixtures__/matrixIdentification.realBackend.json";

const mocks = vi.hoisted(() => ({
  listMatrixRegistries: vi.fn(),
  createIdentificationSession: vi.fn(),
  evaluateIdentificationSession: vi.fn(),
}));

vi.mock("@/lib/matrixIdentification", async () => {
  const actual = await vi.importActual<typeof import("@/lib/matrixIdentification")>("@/lib/matrixIdentification");
  return { ...actual, ...mocks };
});
vi.mock("@/components/matrix/MatrixLexiconGuide", () => ({ default: () => null }));
vi.mock("@/components/matrix/MatrixVisionReviewPanel", () => ({ default: () => null }));
vi.mock("@/features/calyx-workspace/sessionContext", () => ({ recordCalyxSurfaceContext: vi.fn() }));

import {
  MatrixApiError,
  MATRIX_MEMBER_SESSION_REQUIRED_MESSAGE,
  MATRIX_OWNER_ACCESS_MESSAGE,
  MATRIX_UNAVAILABLE_MESSAGE,
} from "@/lib/matrixIdentification";
import OrchidIdentificationNext from "./OrchidIdentificationNext";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

function buttons(label: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button")).filter((item) => item.textContent?.includes(label)) as HTMLButtonElement[];
}

const statusMessage = () => container.querySelector('[data-testid="matrix-status-message"]')?.textContent ?? "";

describe("guided Matrix access states", () => {
  it("asks a signed-out visitor to sign in when the member registry is refused", async () => {
    mocks.listMatrixRegistries.mockRejectedValue(
      new MatrixApiError(MATRIX_MEMBER_SESSION_REQUIRED_MESSAGE, 401, "member_session_required"),
    );
    act(() => root.render(<MemoryRouter><OrchidIdentificationNext /></MemoryRouter>));
    await flush();

    expect(statusMessage()).toBe("Sign in to use Matrix identification.");
    expect(container.textContent).toContain("sign in required");
    expect(container.textContent).not.toMatch(/Matrix API \d{3}/);
    expect(container.textContent).not.toContain("Owner session or API key is required");
    // Retrying cannot create a member session, so none is offered.
    expect(buttons("Try again")).toHaveLength(0);
    expect(buttons("Begin guided identification")[0].disabled).toBe(true);
  });

  it("says Matrix needs owner access when starting a session is refused", async () => {
    mocks.listMatrixRegistries.mockResolvedValue(realBackend.registry_list.versions);
    mocks.createIdentificationSession.mockRejectedValue(
      new MatrixApiError(MATRIX_OWNER_ACCESS_MESSAGE, 403, "owner_access_required"),
    );
    act(() => root.render(<MemoryRouter><OrchidIdentificationNext /></MemoryRouter>));
    await flush();
    await act(async () => { buttons("Begin guided identification")[0].click(); });
    await flush();

    expect(statusMessage()).toBe(MATRIX_OWNER_ACCESS_MESSAGE);
    expect(container.querySelectorAll('[data-testid="matrix-candidate"]')).toHaveLength(0);
  });

  it("shows an unavailable registry as a retryable error and recovers on retry", async () => {
    mocks.listMatrixRegistries
      .mockRejectedValueOnce(new MatrixApiError(MATRIX_UNAVAILABLE_MESSAGE, 503, "unavailable"))
      .mockResolvedValueOnce(realBackend.registry_list.versions);
    act(() => root.render(<MemoryRouter><OrchidIdentificationNext /></MemoryRouter>));
    await flush();

    expect(statusMessage()).toBe("Matrix identification is temporarily unavailable. Try again.");
    expect(container.textContent).toContain("error");
    await act(async () => { buttons("Try again")[0].click(); });
    await flush();

    expect(mocks.listMatrixRegistries).toHaveBeenCalledTimes(2);
    expect(statusMessage()).toBe("Choose a governed matrix and begin.");
    expect(buttons("Try again")).toHaveLength(0);
  });
});
