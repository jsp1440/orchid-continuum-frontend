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

describe("curation shows only values the server sent", () => {
  it("labels unknown values verbatim and missing verification as Not verified", async () => {
    stubFetch((url) => {
      if (url.includes("/curation/queue"))
        return {
          status: 200,
          body: {
            principal_id: "owner",
            items: [
              {
                item: { ...CARD, topic: "ethnobotany" },
                current_item_version: 1,
                submissions: [
                  {
                    submission_id: "s-1",
                    reviewer: { reviewer_id: "rv-1", name: "Reviewer A", email: "reviewer-a@example.org" },
                    item_version: 1,
                    submitted_at: "t1",
                    verdict: "maybe",
                    corrections: ["geography"],
                    verification: { counts_toward_recognition: "yes", note: "" },
                  },
                  {
                    submission_id: "s-2",
                    reviewer: { reviewer_id: "rv-2", name: "Reviewer B", email: "reviewer-b@example.org" },
                    item_version: 1,
                    submitted_at: "t2",
                    verdict: "supported",
                    corrections: [],
                    verification: null,
                  },
                ],
                agreement: { versions: [{ item_version: 1, submissions: 2, status: "partial", verdict_counts: { supported: 1, maybe: 1 }, corrections: {} }] },
                decisions: [],
                latest_decision: { decision: "escalate", note: "", curator_principal: "owner", submission_ids: [], decided_at: "t3" },
              },
            ],
          },
        };
      if (url.includes("/curation/reviewers")) return { status: 200, body: { thresholds: { paper_reviews: 3, claim_reviews: 10 }, reviewers: [] } };
      return undefined;
    });
    const check = vi.fn(async () => ({ authenticated: true, status: "ok", owner: "owner", token: "cookie", expires_at: null, allowedActions: {} }));
    at("/curation/literature", "/curation/literature", <LiteratureCuration checkSession={check as never} />);
    await screen.findAllByTestId("curation-submission");
    const text = document.body.textContent ?? "";
    expect(text).toContain("Verdict: Unknown value: maybe");
    expect(text).toContain("Corrections: Unknown value: geography");
    expect(text).toContain("Counts toward recognition: Unknown value: yes");
    expect(text).toContain("Counts toward recognition: Not verified");
    expect(text).toContain("Unknown value: partial");
    expect(text).toContain("Unknown value: maybe 1");
    expect(text).toContain("Latest decision: Unknown value: escalate");
    expect(text).not.toMatch(/Latest decision: Defer/);
  });

  it("review home shows an unknown topic verbatim", async () => {
    stubFetch((url) => (url.includes("kind=paper") ? { status: 200, body: { items: [{ ...PAPER, topic: "ethnobotany" }] } } : undefined));
    at("/review", "/review", <LiteratureReview />);
    expect(await screen.findByText(/Unknown value: ethnobotany/)).toBeTruthy();
  });
});

describe("rejected reviewer key", () => {
  it("offers Forget this key, reopens the identity dialog, and keeps the form draft", async () => {
    localStorage.setItem(REVIEWER_TOKEN_STORAGE_KEY, "stale-key");
    let registered = false;
    stubFetch((url, init) => {
      if (url.includes("/items/")) return { status: 200, body: CARD };
      if (url.includes("/drafts/")) return init.method === "PUT" ? { status: 200, body: {} } : { status: 404, body: {} };
      if (url.endsWith("/reviewers")) {
        registered = true;
        return { status: 201, body: { reviewer_token: "fresh-key" } };
      }
      if (url.endsWith("/submissions")) {
        const auth = new Headers(init.headers).get("Authorization");
        return auth === "Bearer fresh-key"
          ? { status: 201, body: RECEIPT }
          : { status: 401, body: { detail: { code: "REVIEWER_TOKEN_INVALID", message: "x" } } };
      }
      return undefined;
    });
    at("/review/card/card%3Af-1", "/review/card/:itemId", <LiteratureReviewCard />);
    await screen.findByText("Synthetic claim about pollination.");
    fireEvent.click(screen.getByLabelText("Unsupported"));
    fireEvent.change(screen.getByLabelText("Explanation"), { target: { value: "kept explanation" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit this review" }));

    const alert = await screen.findByTestId("key-rejected");
    expect(screen.queryByTestId("identity-form")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Forget this key and register again" }));
    expect(localStorage.getItem(REVIEWER_TOKEN_STORAGE_KEY)).toBeNull();
    expect(alert.isConnected).toBe(false);
    const form = await screen.findByTestId("identity-form");
    expect((screen.getByLabelText("Explanation") as HTMLTextAreaElement).value).toBe("kept explanation");

    fireEvent.change(screen.getByLabelText("Name (required)"), { target: { value: "Reviewer A" } });
    fireEvent.change(screen.getByLabelText("Email (required)"), { target: { value: "reviewer-a@example.org" } });
    fireEvent.click(screen.getByTestId("privacy-ack"));
    fireEvent.submit(form);
    await screen.findByTestId("submit-receipt");
    expect(registered).toBe(true);
    const last = submissions().at(-1)!;
    expect(JSON.parse(String(last.init.body))).toMatchObject({ verdict: "unsupported", explanation: "kept explanation" });
  });

  it("checks a pasted key with GET /me before storing it", async () => {
    stubFetch((url, init) => {
      if (url.includes("kind=paper")) return { status: 200, body: { items: [] } };
      if (url.endsWith("/me")) {
        const auth = new Headers(init.headers).get("Authorization");
        return auth === "Bearer good-key"
          ? {
              status: 200,
              body: {
                profile: { name: "Reviewer A", email: "reviewer-a@example.org", future_invitations_opt_in: false },
                submissions: [],
                progress: { paper_reviews: { verified: 0, required: 3, met: false }, claim_reviews: { verified: 0, required: 10, met: false } },
                award: null,
                recognition: null,
              },
            }
          : { status: 401, body: { detail: { code: "REVIEWER_TOKEN_INVALID", message: "x" } } };
      }
      return undefined;
    });
    at("/review", "/review", <LiteratureReview />);
    const input = await screen.findByLabelText(/Enter your reviewer key/);
    fireEvent.change(input, { target: { value: "bad-key" } });
    fireEvent.submit(input.closest("form")!);
    expect((await screen.findByTestId("use-key-error")).textContent).toMatch(/not recognised/);
    expect(localStorage.getItem(REVIEWER_TOKEN_STORAGE_KEY)).toBeNull();

    fireEvent.change(screen.getByLabelText(/Enter your reviewer key/), { target: { value: "good-key" } });
    fireEvent.submit(screen.getByLabelText(/Enter your reviewer key/).closest("form")!);
    await screen.findByTestId("my-contributions");
    expect(localStorage.getItem(REVIEWER_TOKEN_STORAGE_KEY)).toBe("good-key");
  });

  it("My contributions offers Forget this key when the stored key is rejected", async () => {
    const onForget = vi.fn();
    render(
      <MemoryRouter>
        <MyContributions
          token="stale"
          onForget={onForget}
          load={async () => {
            const { LiteratureReviewError } = await import("@/lib/literatureReviewApi");
            throw new LiteratureReviewError("unauthorized", "x", 401, "REVIEWER_TOKEN_INVALID");
          }}
        />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Forget this key" }));
    expect(onForget).toHaveBeenCalledTimes(1);
  });
});

describe("draft kept across first registration", () => {
  it("does not reset close-read state when the server has no draft and browser storage is blocked", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation((key: string, value: string) => {
      if (key.startsWith("oc.literatureReview.draft")) throw new Error("blocked");
      // Drafts are blocked; the reviewer token can still be stored.
      (localStorage as unknown as Record<string, string>)[key] = value;
    });
    const puts: string[] = [];
    stubFetch((url, init) => {
      if (url.includes("kind=paper")) return { status: 200, body: { items: [PAPER] } };
      if (url.includes("kind=card")) return { status: 200, body: { items: [CARD] } };
      if (url.endsWith("/reviewers")) return { status: 201, body: { reviewer_token: "tok-synthetic" } };
      if (url.endsWith("/submissions")) return { status: 201, body: { ...RECEIPT, item_id: PAPER.item_id } };
      if (url.includes("/drafts/")) {
        if (init.method === "PUT") {
          puts.push(String(init.body));
          return { status: 200, body: {} };
        }
        return { status: 404, body: { detail: { code: "NOT_FOUND", message: "x" } } };
      }
      return undefined;
    });
    try {
      at(`/review/paper/${encodeURIComponent(DOI)}`, "/review/paper/:doi", <LiteratureReviewPaper />);
      fireEvent.change(await screen.findByLabelText("Key findings, in your words"), { target: { value: "My own reading." } });
      fireEvent.click(screen.getByRole("button", { name: /Save my findings/ }));
      await screen.findByTestId("paper-review-form");
      fireEvent.click(screen.getByRole("button", { name: "Submit paper review" }));
      const form = await screen.findByTestId("identity-form");
      fireEvent.change(screen.getByLabelText("Name (required)"), { target: { value: "Reviewer A" } });
      fireEvent.change(screen.getByLabelText("Email (required)"), { target: { value: "reviewer-a@example.org" } });
      fireEvent.click(screen.getByTestId("privacy-ack"));
      fireEvent.submit(form);
      await screen.findByTestId("submit-receipt");
      // Still revealed, findings still present, after the token appeared.
      expect(screen.getByTestId("own-findings-locked").textContent).toContain("My own reading.");
      expect(screen.queryByTestId("close-read-gate")).toBeNull();
      await waitFor(() => expect(puts.length).toBeGreaterThan(0));
      expect(JSON.parse(puts[0]).payload).toMatchObject({ reveal: "saved", own_key_findings: "My own reading." });
      const body = JSON.parse(String(submissions().at(-1)!.init.body));
      expect(body).toMatchObject({ own_findings_before_reveal: true, own_key_findings: "My own reading." });
    } finally {
      setItem.mockRestore();
    }
  });
});

describe("backend b6b99753 recognition details", () => {
  const awarded = () =>
    me({
      award: { title: "Calyx Scientific Review Contributor", basis: "claim_reviews", awarded_at: "2026-11-20T00:00:00Z" },
      resume_wording: "Server résumé wording.",
    });

  it("highlights the field named by LOCALITY_IN_PUBLIC_TEXT without echoing the text", async () => {
    stubFetch((url) =>
      url.endsWith("/me/recognition")
        ? {
            status: 422,
            body: { detail: { code: "LOCALITY_IN_PUBLIC_TEXT", message: "The description contains a locality.", fields: { description: "coordinates" } } },
          }
        : undefined,
    );
    render(
      <MemoryRouter>
        <MyContributions token="tok" load={async () => awarded()} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByTestId("recognition-consent"));
    fireEvent.change(screen.getByTestId("recognition-display_name"), { target: { value: "Reviewer A" } });
    fireEvent.change(screen.getByTestId("recognition-description"), { target: { value: "Reviewed papers near 0.000, 0.000" } });
    fireEvent.submit(screen.getByTestId("recognition-form"));
    const note = await screen.findByTestId("recognition-description-flag");
    expect(note.textContent).toMatch(/coordinates/);
    expect(screen.getByTestId("recognition-description").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByTestId("recognition-display_name").getAttribute("aria-invalid")).toBeNull();
    expect(screen.queryByTestId("recognition-display_name-flag")).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/locality/i);
  });

  it("shows no citable link while slug is null or the entry is not listed", async () => {
    render(
      <MemoryRouter>
        <MyContributions
          token="tok"
          load={async () => ({
            ...awarded(),
            recognition: {
              consent: true,
              consent_updated_at: "t",
              display_name: "Reviewer A",
              affiliation: null,
              link: null,
              description: "d",
              curator_approved: false,
              listed: false,
              slug: "reviewer-a-x1y2",
              citable_path: null,
            },
          })}
        />
      </MemoryRouter>,
    );
    await screen.findByTestId("award");
    expect(screen.queryByTestId("citable-link")).toBeNull();
    expect(screen.getByText(/waiting for curator approval/)).toBeTruthy();
  });

  it("builds the citable link from the slug once listed", async () => {
    render(
      <MemoryRouter>
        <MyContributions
          token="tok"
          load={async () => ({
            ...awarded(),
            recognition: {
              consent: true,
              consent_updated_at: "t",
              display_name: "Reviewer A",
              affiliation: null,
              link: null,
              description: "d",
              curator_approved: true,
              listed: true,
              slug: "reviewer-a-x1y2",
              citable_path: "/contributors/reviewer-a-x1y2",
            },
          })}
        />
      </MemoryRouter>,
    );
    const link = await screen.findByTestId("citable-link");
    expect(link.querySelector("a")?.getAttribute("href")).toBe("/contributors/reviewer-a-x1y2");
  });

  it("curator reviewer rows say 'No public page yet' when a recognition row has no slug", async () => {
    stubFetch((url) => {
      if (url.includes("/curation/queue")) return { status: 200, body: { principal_id: "owner", items: [] } };
      if (url.includes("/curation/reviewers"))
        return {
          status: 200,
          body: {
            thresholds: { paper_reviews: 3, claim_reviews: 10 },
            reviewers: [
              {
                reviewer_id: "rv-1",
                name: "Reviewer A",
                email: "reviewer-a@example.org",
                future_invitations_opt_in: false,
                progress: { paper_reviews: { verified: 0, required: 3, met: false }, claim_reviews: { verified: 10, required: 10, met: true } },
                award: { title: "Calyx Scientific Review Contributor", basis: "claim_reviews", awarded_at: "t" },
                recognition: { slug: null, consent: false, consent_updated_at: null, curator_approved: false, display_name: "", affiliation: null, link: null, description: "" },
              },
            ],
          },
        };
      return undefined;
    });
    const check = vi.fn(async () => ({ authenticated: true, status: "ok", owner: "owner", token: "cookie", expires_at: null, allowedActions: {} }));
    at("/curation/literature", "/curation/literature", <LiteratureCuration checkSession={check as never} />);
    fireEvent.click(await screen.findByRole("tab", { name: /Reviewers/ }));
    expect((await screen.findByTestId("public-page")).textContent).toBe("No public page yet");
  });
});
