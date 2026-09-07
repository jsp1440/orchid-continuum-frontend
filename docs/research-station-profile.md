# Public Research Station profile

PR #516 converges on the researcher page already introduced by #582 and #584.
One React content component produces both the client page and the checked-in
HTML read by reviewers and crawlers without JavaScript or authentication.

Canonical route: `/research-station/researchers/jeffery-scott-parham`.
`/research-station` and `/research-station/about` serve the same profile. Vercel
and Netlify-compatible hosts resolve these routes before their SPA fallback.
The member workspace `/research` retains its authentication boundary.

## Editorial evidence reviewed 7 September 2026

- Owner's #516 repair instruction establishes Jeffery Scott Parham, M.S., as
  Founder and Scientific Lead of Orchid Continuum Research Station. This is
  program leadership, not an asserted university appointment or funded grant PI.
- [FCOS officers directory](https://www.fcos.org/about-us) names Jeffery Parham
  as 2026 President and publishes `fcospresident@gmail.com` as the office contact.
  Use this verified organizational role address, not the unverified domain
  address from the old draft. Do not copy private contact details from CVs.
- [Ecologistics sponsored projects](https://ecologistics.org/fiscal-sponsorship/sponsored-organizations/)
  independently lists The Orchid Continuum under its fiscal sponsorship.
  This establishes sponsorship of the initiative, not a separate legal status
  for the Research Station, university employment, or an awarded research grant.
- #516 and the merged #582/#584 profile agree on M.S. Plant Pathology at the
  University of California, Riverside. They conflict on the bachelor's degree
  designation and M.A. specialization. Those disputed details are omitted;
  add them only after a corrected primary credential source is supplied.
- Prior USDA research and teaching are described as prior experience, using
  #516 and #582/#584. No current government/university appointment is asserted.
- The two project titles and descriptions come from #516's proposal materials.
  The image framework is explicitly in development; the glossary is a proposal
  for the 2026 NHOS opportunity. No supplied evidence establishes submission,
  an award, or completed grant deliverables, so none is claimed.
- Active software directions are supported by existing Research Station,
  literature, Atlas, relationship explorer, and lexicon code on integration.
  Public links are entry points, not claims of complete backend/data coverage.
  No publications, grant identifiers, awards, corpus counts, or research findings
  are invented for verification purposes.

## Editing and validation

Edit `src/components/research/ResearchStationProfile.tsx` and public facts in
`src/content/researchStationProfile.ts`. Styling is shared through
`public/research-station-profile.css`. Run `npm run generate:research-profile`
and commit the generated `public/researcher-jeffery-scott-parham.html`.
`npm run build` regenerates it. The focused test rejects stale generated HTML,
checks public routing and metadata, and enforces the narrow contact boundary.

Do not add residential addresses, telephone numbers, EINs, private reference
contacts, credentials/secrets, or precise species locality to any of these
public surfaces, including structured data and generated files. The repair
removes the obsolete `ResearchStationPublic.tsx` from the branch's current tree;
it does not rewrite old commit history or delete historical preview deployments.

## Production boundary

This work targets `oc-autonomous-integration` only. The older production-only
PR #585 contains the superseded static profile and must not be promoted as the
publication-ready result. A production promotion must include this repair's
generated HTML, shared CSS, route rewrites, and any selected React changes.

An owner-authorized promotion to `main` and production deployment are required.
The production host must serve this repository's `dist` output, apply the
rewrites, and have `orchidcontinuum.org` assigned with HTTPS. Domain assignment
cannot be proven or changed by an integration merge. After deployment, verify
HTTP 200 HTML, canonical metadata, CSS, and all three public routes without
JavaScript or authentication, and check that `/research` still requests sign-in.
