// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backendConfig", () => ({ CALYX_BACKEND_BASE_URL: "https://calyx.test" }));
vi.mock("@/components/orchid/PageShell", () => ({
  default: ({ children, intro }: { children: ReactNode; intro?: ReactNode }) => (
    <main>
      {intro ? <p>{intro}</p> : null}
      {children}
    </main>
  ),
}));

import LiteratureReviewCard from "@/pages/LiteratureReviewCard";
import LiteratureReviewPaper from "@/pages/LiteratureReviewPaper";
import LiteratureReview from "@/pages/LiteratureReview";
import { ContributorsList } from "@/pages/Contributors";
import LiteratureCuration from "@/pages/LiteratureCuration";
import MyContributions from "./MyContributions";
import { REVIEWER_TOKEN_STORAGE_KEY, type MyProfile } from "@/lib/literatureReviewApi";

const DOI = "10.0000/synthetic.1";
const CARD = {
  item_id: "card:f-1",
  kind: "card",
  item_version: 1,
  doi: DOI,
  paper_title: "A synthetic paper",
  citation: "Author A (2020)",
  topic: "pollination",
  input_note: null,
  paper_item_id: `paper:${DOI}`,
  claim: "Synthetic claim about pollination.",
  orchid_name: null,
  evidence_quote: null,
  source_locator: null,
  evidence_type: null,
};
const PAPER = { ...CARD, kind: "paper", item_id: `paper:${DOI}`, card_item_ids: ["card:f-1"] };
const RECEIPT = { submission_id: "s-1", item_id: "card:f-1", item_version: 1, doi: DOI, submitted_at: "2026-11-25T00:00:00Z" };

type Handler = (url: string, init: RequestInit) => { status: number; body: unknown } | undefined;
let calls: Array<{ url: string; init: RequestInit }> = [];

function stubFetch(handler: Handler) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      const hit = handler(url, init) ?? { status: 404, body: { detail: { code: "NOT_FOUND", message: "x" } } };
      return new Response(JSON.stringify(hit.body), { status: hit.status });
    }),
  );
}

function at(path: string, routePath: string, element: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routePath} element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function submissions() {
  return calls.filter((c) => c.url.endsWith("/submissions"));
}

describe("card review", () => {
  beforeEach(() =>
    stubFetch((url, init) => {
      if (url.includes("/items/")) return { status: 200, body: CARD };
      if (url.endsWith("/reviewers")) return { status: 201, body: { reviewer_token: "tok-synthetic" } };
      if (url.endsWith("/submissions")) return { status: 201, body: RECEIPT };
      if (url.includes("/drafts/")) return init.method === "PUT" ? { status: 200, body: {} } : { status: 404, body: {} };
      return undefined;
    }),
  );

  it("requires a verdict, accepts Not sure, and asks for identity only on the first submit", async () => {
    at("/review/card/card%3Af-1", "/review/card/:itemId", <LiteratureReviewCard />);
    await screen.findByText("Synthetic claim about pollination.");
    expect(screen.getByTestId("review-disclaimer").textContent).toMatch(/unreviewed machine extraction/);

    // No verdict: nothing sent, a prompt shown, no dialog.
    fireEvent.click(screen.getByRole("button", { name: "Submit this review" }));
    expect(await screen.findByText(/Choose a verdict/)).toBeTruthy();
    expect(screen.queryByTestId("identity-form")).toBeNull();
    expect(submissions()).toHaveLength(0);

    fireEvent.click(screen.getByLabelText("Not sure"));
    fireEvent.click(screen.getByRole("button", { name: "Submit this review" }));
    const form = await screen.findByTestId("identity-form");
    const optIn = screen.getByTestId("future-invitations-opt-in") as HTMLInputElement;
    const privacy = screen.getByTestId("privacy-ack") as HTMLInputElement;
    expect(optIn.checked).toBe(false);
    expect(optIn).not.toBe(privacy);
    expect(screen.getByTestId("privacy-notice").textContent).toMatch(/only by authorised .*curators/);
    const honeypot = screen.getByTestId("honeypot-website") as HTMLInputElement;
    expect(honeypot.tabIndex).toBe(-1);
    expect(honeypot.closest("[aria-hidden='true']")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Name (required)"), { target: { value: "Reviewer A" } });
    fireEvent.change(screen.getByLabelText("Email (required)"), { target: { value: "reviewer-a@example.org" } });
    fireEvent.click(privacy);
    fireEvent.submit(form);

    await screen.findByTestId("submit-receipt");
    const reg = calls.find((c) => c.url.endsWith("/reviewers"))!;
    expect(JSON.parse(String(reg.init.body))).toMatchObject({ future_invitations_opt_in: false, website: "", privacy_ack: true });
    expect(localStorage.getItem(REVIEWER_TOKEN_STORAGE_KEY)).toBe("tok-synthetic");
    expect(submissions()).toHaveLength(1);
    expect(new Headers(submissions()[0].init.headers).get("Authorization")).toBe("Bearer tok-synthetic");
    expect(JSON.parse(String(submissions()[0].init.body)).verdict).toBe("not_sure");

    // Second submit: straight through, no dialog.
    fireEvent.click(screen.getByLabelText("Supported"));
    fireEvent.click(screen.getByRole("button", { name: "Submit this review" }));
    await waitFor(() => expect(submissions()).toHaveLength(2));
    expect(screen.queryByTestId("identity-form")).toBeNull();
    expect(calls.filter((c) => c.url.endsWith("/reviewers"))).toHaveLength(1);
  });

  it("autosaves a draft in browser storage before a token exists", async () => {
    at("/review/card/card%3Af-1", "/review/card/:itemId", <LiteratureReviewCard />);
    await screen.findByText("Synthetic claim about pollination.");
    fireEvent.change(screen.getByLabelText("Explanation"), { target: { value: "draft text" } });
    await waitFor(() => expect(localStorage.getItem("oc.literatureReview.draft.v1:card:f-1")).toContain("draft text"), { timeout: 3000 });
    expect(calls.some((c) => c.url.includes("/drafts/"))).toBe(false);
  });
});

describe("close-read paper review", () => {
  it("hides (and does not fetch) the paper's cards until own findings are saved or skipped", async () => {
    stubFetch((url) => {
      if (url.includes("/items?") && url.includes("kind=paper")) return { status: 200, body: { items: [PAPER] } };
      if (url.includes("/items?") && url.includes("kind=card")) return { status: 200, body: { items: [CARD] } };
      return undefined;
    });
    at(`/review/paper/${encodeURIComponent(DOI)}`, "/review/paper/:doi", <LiteratureReviewPaper />);
    await screen.findByTestId("close-read-gate");
    expect(screen.queryByText("Synthetic claim about pollination.")).toBeNull();
    expect(screen.queryByTestId("paper-review-form")).toBeNull();
    expect(calls.some((c) => c.url.includes("kind=card"))).toBe(false);

    const save = screen.getByRole("button", { name: /Save my findings/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Key findings, in your words"), { target: { value: "My own reading." } });
    fireEvent.click(save);

    await screen.findByText("Synthetic claim about pollination.");
    expect(screen.getByTestId("paper-review-form")).toBeTruthy();
    expect(screen.getByTestId("own-findings-locked").textContent).toContain("My own reading.");
  });

  it("records an explicit skip", async () => {
    stubFetch((url) => {
      if (url.includes("kind=paper")) return { status: 200, body: { items: [PAPER] } };
      if (url.includes("kind=card")) return { status: 200, body: { items: [] } };
      return undefined;
    });
    at(`/review/paper/${encodeURIComponent(DOI)}`, "/review/paper/:doi", <LiteratureReviewPaper />);
    fireEvent.click(await screen.findByRole("button", { name: "Skip this step" }));
    expect((await screen.findByTestId("close-read-state")).textContent).toMatch(/skipped/);
  });
});

const PROGRESS = {
  paper_reviews: { verified: 1, required: 3, met: false },
  claim_reviews: { verified: 4, required: 10, met: false },
  eligible_bases: [],
  submissions_total: 5,
  pending_verification: 1,
};
function me(over: Partial<MyProfile> = {}): MyProfile {
  return {
    reviewer_id: "rv-1",
    name: "Reviewer A",
    email: "reviewer-a@example.org",
    education_training: null,
    future_invitations_opt_in: false,
    future_invitations_updated_at: null,
    submissions: [],
    progress: PROGRESS,
    award: null,
    recognition: null,
    resume_wording: null,
    authorship_note: "Authorship is handled separately.",
    privacy_notice: null,
    ...over,
  };
}

describe("my contributions", () => {
  it("shows no recognition form before an award", async () => {
    render(
      <MemoryRouter>
        <MyContributions token="tok" load={async () => me()} />
      </MemoryRouter>,
    );
    await screen.findByTestId("my-contributions");
    expect(screen.queryByTestId("recognition-form")).toBeNull();
    expect(screen.queryByTestId("resume-wording")).toBeNull();
    expect(screen.getByLabelText("Verified substantive paper reviews").getAttribute("aria-valuenow")).toBe("1");
  });

  it("after an award, offers recognition consent as a control separate from the invitation opt-in", async () => {
    render(
      <MemoryRouter>
        <MyContributions
          token="tok"
          load={async () =>
            me({
              award: { title: "Calyx Scientific Review Contributor", basis: "paper_reviews", awarded_at: "2026-11-20T00:00:00Z" },
              resume_wording: "Server résumé wording.",
            })
          }
        />
      </MemoryRouter>,
    );
    await screen.findByTestId("recognition-form");
    const consent = screen.getByTestId("recognition-consent") as HTMLInputElement;
    const invite = screen.getByTestId("me-future-invitations-opt-in") as HTMLInputElement;
    expect(consent).not.toBe(invite);
    expect(consent.checked).toBe(false);
    expect(invite.checked).toBe(false);
    expect(screen.getByTestId("recognition-form").contains(invite)).toBe(false);
    expect(screen.getByTestId("invitation-preference").contains(consent)).toBe(false);
    expect(screen.getByTestId("resume-wording").textContent).toBe("Server résumé wording.");

    fireEvent.click(consent);
    fireEvent.change(screen.getByLabelText(/Professional link/), { target: { value: "http://insecure.example.org" } });
    expect(screen.getByText(/must start with https/)).toBeTruthy();
  });
});

describe("fail closed", () => {
  beforeEach(() => stubFetch(() => ({ status: 503, body: { detail: { code: "LITERATURE_REVIEW_STORE_UNAVAILABLE", message: "x" } } })));

  it("review home shows a message, not items", async () => {
    at("/review", "/review", <LiteratureReview />);
    const error = await screen.findByTestId("review-load-error");
    expect(error.textContent).toMatch(/Nothing is shown in its place/);
    expect(screen.queryAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/review/"))).toHaveLength(0);
    expect(screen.getAllByText(/help evaluate and improve Calyx, Orchid Continuum's AI-assisted scientific reasoning system/).length).toBeGreaterThan(0);
  });

  it("contributors page invents no contributors", async () => {
    at("/contributors", "/contributors", <ContributorsList />);
    await screen.findByTestId("contributors-error");
    expect(screen.queryByText(/No contributors are listed yet/)).toBeNull();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("card page shows the failure and no form", async () => {
    at("/review/card/card%3Af-1", "/review/card/:itemId", <LiteratureReviewCard />);
    await screen.findByTestId("review-load-error");
    expect(screen.queryByTestId("card-review-form")).toBeNull();
  });

  it("curation asks for the owner sign-in when no owner session exists, and loads nothing", async () => {
    const check = vi.fn(async () => ({ authenticated: false, status: "error", owner: "", token: undefined, expires_at: null, allowedActions: {} }));
    await act(async () => {
      at("/curation/literature", "/curation/literature", <LiteratureCuration checkSession={check as never} />);
    });
    expect(await screen.findByLabelText("Owner access code")).toBeTruthy();
    expect(calls.some((c) => c.url.includes("/curation/"))).toBe(false);
  });
});
