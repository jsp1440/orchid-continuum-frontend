import React from 'react';
import { researchStationProfile as profile } from '../../content/researchStationProfile';

/** Shared by the client route and the generated, JavaScript-free verification page. */
export default function ResearchStationProfile() {
  return (
    <div className="rs-profile">
      <a className="rs-skip" href="#profile-main">Skip to profile</a>
      <header className="rs-header">
        <a className="rs-brand" href="/">Orchid <em>Continuum</em></a>
        <nav aria-label="Research Station navigation">
          <a href="/research-station">Research Station</a>
          <a href="/research-station/about#program">About the program</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>

      <main id="profile-main" tabIndex={-1}>
        <section className="rs-hero" aria-labelledby="profile-name">
          <div className="rs-wrap rs-hero-grid">
            <div>
              <p className="rs-eyebrow">{profile.program}</p>
              <h1 id="profile-name">{profile.name}<span className="rs-degree">{profile.credential}</span></h1>
              <p className="rs-role">{profile.role}</p>
              <p className="rs-intro">Botanist and orchid researcher developing scientific tools that connect orchid biodiversity with its literature, ecological relationships, and supporting evidence.</p>
              <a className="rs-button" href="#work">Explore current research <span aria-hidden="true">↓</span></a>
            </div>
            <aside className="rs-identity" aria-label="Researcher at a glance">
              <p className="rs-eyebrow">Researcher at a glance</p>
              <dl>
                <div><dt>Scientific program</dt><dd>{profile.program}</dd></div>
                <div><dt>Graduate education</dt><dd>M.S., Plant Pathology<br />University of California, Riverside</dd></div>
                <div><dt>Society role</dt><dd>President, Five Cities Orchid Society</dd></div>
                <div><dt>Public organizational contact</dt><dd><a href={`mailto:${profile.contactEmail}`}>{profile.contactEmail}</a><span className="rs-detail">Office of the FCOS President</span></dd></div>
              </dl>
            </aside>
          </div>
        </section>

        <div className="rs-wrap rs-body">
          <section id="program" className="rs-section rs-program" aria-labelledby="program-heading">
            <div>
              <p className="rs-eyebrow">The research program</p>
              <h2 id="program-heading">Orchid science, connected to its evidence</h2>
              <p>Orchid Continuum is an independent biodiversity-informatics and conservation initiative focused on Orchidaceae. The Research Station is its scientific research program and workspace: a place to organize questions, examine literature, preserve provenance, and develop reproducible tools for orchid research.</p>
              <p>As Founder and Scientific Lead, Parham directs research priorities and scientific software development. Current work brings botanical research and orchid horticulture together with taxonomy, ecological-interaction evidence, conservation information, and scientific computing.</p>
            </div>
            <aside className="rs-note" aria-labelledby="affiliation-heading">
              <h3 id="affiliation-heading">Organizational relationships</h3>
              <p>Orchid Continuum operates with nonprofit fiscal sponsorship through Ecologistics, Inc. The Research Station is a program within that initiative.</p>
              <a href={profile.sponsorUrl}>Verify the Ecologistics project listing <span aria-hidden="true">↗</span></a>
              <p>Parham also serves as President of the Five Cities Orchid Society (FCOS), an orchid society supporting education, research, and conservation.</p>
              <a href={profile.societyUrl}>Verify FCOS leadership <span aria-hidden="true">↗</span></a>
            </aside>
          </section>

          <section id="work" className="rs-section" aria-labelledby="work-heading">
            <p className="rs-eyebrow">Active research & development</p>
            <h2 id="work-heading">Current work</h2>
            <p className="rs-section-intro">The program is developing research infrastructure and methods. Public tools below provide entry points into this work; data coverage and service availability vary, and gaps in evidence remain visible.</p>
            <div className="rs-projects">
              <article className="rs-project">
                <p className="rs-status">In development</p>
                <h3>Literature, provenance & scientific memory</h3>
                <p>Connecting research questions with source literature, reviewable evidence, and persistent research records. Research Station and Calyx development focuses on traceable retrieval and synthesis with uncertainty and human review.</p>
                <a href="/literature">Explore the literature workspace <span aria-hidden="true">→</span></a>
              </article>
              <article className="rs-project">
                <p className="rs-status">In development</p>
                <h3>Taxonomy & biodiversity informatics</h3>
                <p>Linking orchid names, images, occurrences, and conservation context while retaining source attribution. Taxonomic governance and provenance are central to making distributed records useful for research.</p>
                <a href="/atlas">Explore the orchid Atlas <span aria-hidden="true">→</span></a>
              </article>
              <article className="rs-project">
                <p className="rs-status">Active research direction</p>
                <h3>Ecological interactions & conservation</h3>
                <p>Investigating how pollination, mycorrhizal associations, germination, and cultivation inform orchid biology and conservation. Current tools aim to distinguish documented interactions from inference and missing evidence.</p>
                <a href="/relationship-explorer">Explore ecological relationships <span aria-hidden="true">→</span></a>
              </article>
            </div>
            <div className="rs-workspace">
              <div><h3>Research Station workspace</h3><p>Project records, research queries, and evidence review are available through the member workspace.</p></div>
              <a href="/research">Open workspace <span className="rs-detail">Sign-in required</span></a>
            </div>
          </section>

          <section id="background" className="rs-section rs-background" aria-labelledby="background-heading">
            <div>
              <p className="rs-eyebrow">Scientific background</p>
              <h2 id="background-heading">Education & research experience</h2>
              <p>Parham’s background combines plant pathology, botanical teaching, postharvest research, and experimental orchid propagation.</p>
            </div>
            <dl className="rs-background-list">
              <div><dt>Education</dt><dd>M.S., Plant Pathology — University of California, Riverside.</dd></div>
              <div><dt>Prior research</dt><dd>USDA Horticultural Crops Research Laboratory experience, including postharvest citrus pathology.</dd></div>
              <div><dt>Prior teaching</dt><dd>Teaching experience at National University and Fresno City College, with a background in botany, plant physiology, plant pathology, and biology.</dd></div>
              <div><dt>Orchid research practice</dt><dd>Asymbiotic seed germination, tissue culture, and experimental propagation.</dd></div>
            </dl>
          </section>

          <section id="proposals" className="rs-section" aria-labelledby="proposals-heading">
            <p className="rs-eyebrow">Proposed work</p>
            <h2 id="proposals-heading">Research & education proposals</h2>
            <p className="rs-section-intro">These proposed projects describe intended work. No submission, funding award, or completed research outcome is claimed here.</p>
            <div className="rs-proposals">
              <article className="rs-note">
                <p className="rs-status">Proposal in development</p>
                <h3>Developing an Image-Based Data Integration Framework to Support Orchid Conservation</h3>
                <p>A proposed research-infrastructure project to connect orchid images with taxonomic, geographic, and ecological metadata for conservation research.</p>
              </article>
              <article className="rs-note">
                <p className="rs-status">Proposal · 2026 NHOS grant materials</p>
                <h3>Orchid Botanical Glossary: A Free Illustrated Reference for Orchid Conservation Education</h3>
                <p>A proposed illustrated botanical reference for orchid education, prepared for the New Hampshire Orchid Society conservation and education grant opportunity.</p>
                <a href="/lexicon">Explore the existing botanical lexicon <span aria-hidden="true">→</span></a>
              </article>
            </div>
          </section>

          <section id="contact" className="rs-section rs-contact" aria-labelledby="contact-heading">
            <div>
              <p className="rs-eyebrow">Public verification & contact</p>
              <h2 id="contact-heading">Contact the research lead</h2>
              <p>For Research Station inquiries and organizational verification, contact Jeffery Scott Parham through the public office of the Five Cities Orchid Society President.</p>
              <a className="rs-contact-email" href={`mailto:${profile.contactEmail}`}>{profile.contactEmail}</a>
              <p className="rs-small">This role-based address is published in the <a href={profile.societyUrl}>FCOS officers directory</a>.</p>
            </div>
            <div className="rs-verification">
              <h3>Public records & resources</h3>
              <ul>
                <li><a href={profile.societyUrl}>Five Cities Orchid Society leadership</a></li>
                <li><a href={profile.sponsorUrl}>Ecologistics fiscal sponsorship listing</a></li>
                <li><a href="https://github.com/jsp1440/orchid-continuum-frontend">Orchid Continuum scientific software</a></li>
                <li><a href="/about">About Orchid Continuum</a></li>
              </ul>
            </div>
          </section>
        </div>
      </main>
      <footer className="rs-footer rs-wrap">
        <p>Maintained by Orchid Continuum Research Station.<br /><span>Profile reviewed <time dateTime={profile.reviewed}>7 September 2026</time>.</span></p>
        <a href={profile.canonicalPath}>Permanent researcher profile <span aria-hidden="true">↗</span></a>
      </footer>
    </div>
  );
}
