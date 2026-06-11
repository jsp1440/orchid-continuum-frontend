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
import StoriesFromContinuum from './orchid/StoriesFromContinuum';
import HumanStewardship from './orchid/HumanStewardship';
import OrchidGallery from './orchid/OrchidGallery';
import OasisConnective from './orchid/OasisConnective';
import NewsFromContinuum from './orchid/NewsFromContinuum';
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
 * HOMEPAGE-0001 — Narrative Flow Refactor
 *
 * The page should first explain the Orchid Continuum, then demonstrate it.
 * Genus-of-the-Day is not the introduction; it is proof that the connected
 * knowledge graph can turn a genus into a living exhibit.
 *
 *   ACT 1 — WELCOME / WONDER       → HomeHero
 *   ACT 2 — PROBLEM + VISION       → TheKnowledgeGraph
 *   ACT 3 — WHY IT MATTERS         → CapabilityGrid
 *   ACT 4 — CONTINUUM IN ACTION    → DailyGenusFeature + SpeciesInFocus
 *   ACT 5 — NO ORCHID LIVES ALONE  → ContinuumWeb + HomeAtlas
 *   ACT 6 — SCIENCE TO STEWARDSHIP → WhyOrchidsMatter + Stories + HumanStewardship
 *   ACT 7 — VISUAL EXPLORATION     → OrchidGallery
 *   ACT 8 — JOIN / SUPPORT         → OasisConnective + NewsFromContinuum + Footer
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
          {/* ACT 1 — Welcome / Wonder */}
          <HomeHero />

          {/* ACT 2 — The problem and the living knowledge-network solution */}
          <TheKnowledgeGraph />

          {/* ACT 3 — Why the Continuum matters */}
          <CapabilityGrid />

          {/* ACT 4 — The Continuum in Action */}
          <DailyGenusFeature />
          <SpeciesInFocus />

          {/* ACT 5 — The World of Today's Genus */}
          <ContinuumWeb />
          <HomeAtlas />

          {/* ACT 6 — Science, stories, and stewardship */}
          <WhyOrchidsMatter />
          <StoriesFromContinuum />
          <HumanStewardship />

          {/* ACT 7 — Visual exploration */}
          <OrchidGallery />

          {/* ACT 8 — Join, partner, support, subscribe */}
          <OasisConnective />
          <NewsFromContinuum />
        </DailyGenusProvider>
      </main>
      <Footer />
      {/* Curator-facing backend data-source diagnostic (bottom-right pill). */}
      <BackendHealthBanner />
    </div>
  );
};

export default AppLayout;
