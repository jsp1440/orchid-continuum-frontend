import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PageShell from "@/components/orchid/PageShell";
import {
  AUTHORSHIP_NOTE,
  CONTRIBUTOR_TITLE,
  PURPOSE_TEXT,
  describeReviewFailure,
  getContributor,
  listContributors,
  type ContributorsPage,
  type PublicContributor,
} from "@/lib/literatureReviewApi";

type Load<T> = { status: "loading" } | { status: "ok"; value: T } | { status: "failed"; message: string };

function Failure({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-xl border border-amber-300/30 bg-amber-300/[0.06] p-4 text-sm text-amber-100" data-testid="contributors-error">
      {message}
    </p>
  );
}

/** /contributors — public list of awarded, consenting, curator-approved reviewers. */
export function ContributorsList() {
  const [state, setState] = useState<Load<ContributorsPage>>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    listContributors(controller.signal)
      .then((value) => setState({ status: "ok", value }))
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setState({ status: "failed", message: describeReviewFailure(cause) });
      });
    return () => controller.abort();
  }, []);

  return (
    <PageShell
      eyebrow="Calyx literature review"
      title="Contributors"
      titleAccent={CONTRIBUTOR_TITLE}
      intro={`People who reviewed published orchid research to ${PURPOSE_TEXT}. Listed only with their consent, after a curator awarded the title.`}
      showDemoBanner={false}
    >
      <section className="py-10">
        <div className="mx-auto grid max-w-4xl gap-6 px-6 lg:px-10">
          <p className="text-sm text-white/65" data-testid="authorship-note">
            {state.status === "ok" ? state.value.authorship_note : AUTHORSHIP_NOTE}
          </p>
          {state.status === "loading" ? <p className="text-sm text-white/60">Loading contributors…</p> : null}
          {state.status === "failed" ? <Failure message={state.message} /> : null}
          {state.status === "ok" && state.value.contributors.length === 0 ? (
            <p className="text-sm text-white/60">No contributors are listed yet.</p>
          ) : null}
          {state.status === "ok" ? (
            <ul className="grid gap-3">
              {state.value.contributors.map((c) => (
                <li key={c.slug} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <Link to={c.citable_path} className="font-serif text-lg text-white hover:text-emerald-200">
                    {c.display_name}
                  </Link>
                  {c.affiliation ? <p className="text-xs text-white/55">{c.affiliation}</p> : null}
                  <p className="mt-1 text-sm text-white/75">{c.description}</p>
                </li>
              ))}
            </ul>
          ) : null}
          <Link to="/review" className="text-sm text-emerald-200 underline">
            Become a reviewer
          </Link>
        </div>
      </section>
    </PageShell>
  );
}

/** /contributors/:slug — one stable, citable entry. No email, no individual responses. */
export function ContributorDetail() {
  const { slug = "" } = useParams();
  const [state, setState] = useState<Load<PublicContributor & { authorship_note: string }>>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    getContributor(slug, controller.signal)
      .then((value) => setState({ status: "ok", value }))
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setState({ status: "failed", message: describeReviewFailure(cause) });
      });
    return () => controller.abort();
  }, [slug]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <PageShell eyebrow={CONTRIBUTOR_TITLE} title={state.status === "ok" ? state.value.display_name : "Contributor"} showDemoBanner={false}>
      <section className="py-10">
        <div className="mx-auto grid max-w-3xl gap-5 px-6 lg:px-10">
          {state.status === "loading" ? <p className="text-sm text-white/60">Loading…</p> : null}
          {state.status === "failed" ? <Failure message={state.message} /> : null}
          {state.status === "ok" ? (
            <article className="grid gap-3" data-testid="contributor-entry">
              <p className="text-sm text-emerald-100">
                {state.value.title}, Orchid Continuum{state.value.awarded_on ? ` · awarded ${state.value.awarded_on}` : ""}
              </p>
              {state.value.affiliation ? <p className="text-sm text-white/70">{state.value.affiliation}</p> : null}
              {state.value.link ? (
                <a href={state.value.link} rel="noopener noreferrer nofollow" target="_blank" className="text-sm text-emerald-200 underline">
                  {state.value.link}
                </a>
              ) : null}
              <p className="text-sm text-white/85">{state.value.description}</p>
              <blockquote className="border-l-2 border-emerald-300/40 pl-3 text-sm text-white/75" data-testid="resume-wording">
                {state.value.resume_wording}
              </blockquote>
              <p className="text-xs text-white/55">
                Cite this page: {origin}
                {state.value.citable_path}
              </p>
              <p className="text-xs text-white/55">{state.value.authorship_note}</p>
            </article>
          ) : null}
          <Link to="/contributors" className="text-xs text-white/60 underline">
            All contributors
          </Link>
        </div>
      </section>
    </PageShell>
  );
}

export default ContributorsList;
