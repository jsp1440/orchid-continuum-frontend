import React, { useState } from 'react';
import { DailyGenusProvider } from '@/lib/dailyGenusContext';
import Navbar from './orchid/Navbar';
import HomeHero from './orchid/HomeHero';
import DailyGenusFeature from './orchid/DailyGenusFeature';
import TheKnowledgeGraph from './orchid/TheKnowledgeGraph';
import CapabilityGrid from './orchid/CapabilityGrid';
import ContinuumWeb from './orchid/ContinuumWeb';
import SpeciesInFocus from './orchid/SpeciesInFocus';
import HomeAtlas from './orchid/HomeAtlas';
import WhyOrchidsMatter from './orchid/WhyOrchidsMatter';
import HumanStewardship from './orchid/HumanStewardship';
import OrchidGallery from './orchid/OrchidGallery';
import OasisConnective from './orchid/OasisConnective';
import Footer from './orchid/Footer';
import BackendHealthBanner from './orchid/BackendHealthBanner';
import BackendStatusBanner from './orchid/BackendStatusBanner';

/**
 * Orchid Continuum — homepage composition.
 *
 * A slim backend status banner sits at the very top (above the navigation
 * bar); while it is visible the fixed navbar and the page content are shifted
 * down by its height so nothing is occluded.
 *
 * The page tells a story in seven acts:
 *
 *   ACT 1 — WONDER          → HomeHero
 *   ACT 2 — TODAY'S GENUS   → DailyGenusFeature (immediately after the hero)
 *   ACT 3 — PROBLEM/SOLUTION→ TheKnowledgeGraph (deep navy)
 *   ACT 4 — WHAT'S POSSIBLE → CapabilityGrid (eight cards, forest green)
 *   ACT 5 — THE HIDDEN WEB  → ContinuumWeb (live relationship graph)
 *                             + SpeciesInFocus + HomeAtlas
 *   ACT 6 — UNDERSTANDING / STEWARDSHIP → WhyOrchidsMatter + HumanStewardship
 *                             + OrchidGallery
 *   ACT 7 — ACTION          → OasisConnective (support) + Footer
 */

const AppLayout: React.FC = () => {
  const [bannerHeight, setBannerHeight] = useState(0);

  return (
    <div className="min-h-screen bg-[#1a2e1a] antialiased">
      {/* Slim live/slow/offline status banner — above the navigation bar. */}
      <BackendStatusBanner onHeightChange={setBannerHeight} />

      <Navbar topOffset={bannerHeight} />
      <main style={{ paddingTop: bannerHeight }}>
        {/*
         * DailyGenusProvider resolves the Genus of the Day exactly once and
         * distributes it via React context to every homepage section that
         * needs it: DailyGenusFeature, ContinuumWeb, SpeciesInFocus, HomeAtlas.
         * This is the single source of truth — no component below should call
         * featuredGenusName() or fetchGenusOfDay() to determine the genus.
         */}
        <DailyGenusProvider>
          {/* ACT 1 — Wonder */}
          <HomeHero />
          {/* ACT 2 — Today's Genus */}
          <DailyGenusFeature />
          {/* ACT 3 — The Problem and the Solution */}
          <TheKnowledgeGraph />
          {/* ACT 4 — What the Knowledge Graph Makes Possible */}
          <CapabilityGrid />
          {/* ACT 5 — The hidden web of relationships */}
          <ContinuumWeb />
          <SpeciesInFocus />
          <HomeAtlas />
          {/* ACT 6 — Understanding & Stewardship */}
          <WhyOrchidsMatter />
          <HumanStewardship />
          <OrchidGallery />
          {/* ACT 7 — Action */}
          <OasisConnective />
        </DailyGenusProvider>
      </main>
      <Footer />
      {/* Curator-facing backend data-source diagnostic (bottom-right pill). */}
      <BackendHealthBanner />
    </div>
  );
};

export default AppLayout;
