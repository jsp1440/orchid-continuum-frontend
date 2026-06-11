import React, { useState } from 'react';
import { DailyGenusProvider } from '@/lib/dailyGenusContext';
import { HeroSpeciesProvider } from '@/lib/heroSpeciesContext';
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

const AppLayout: React.FC = () => {
  const [bannerHeight, setBannerHeight] = useState(0);

  return (
    <div className="min-h-screen bg-[#1a2e1a] antialiased">
      <BackendStatusBanner onHeightChange={setBannerHeight} />

      <Navbar topOffset={bannerHeight} />

      <main style={{ paddingTop: bannerHeight }}>
        <DailyGenusProvider>
          <HeroSpeciesProvider>
            <HomeHero />

            <TheKnowledgeGraph />

            <CapabilityGrid />

            <DailyGenusFeature />
            <SpeciesInFocus />

            <ContinuumWeb />
            <HomeAtlas />

            <WhyOrchidsMatter />
            <StoriesFromContinuum />
            <HumanStewardship />

            <OrchidGallery />

            <OasisConnective />
            <NewsFromContinuum />
          </HeroSpeciesProvider>
        </DailyGenusProvider>
      </main>

      <Footer />

      <BackendHealthBanner />
    </div>
  );
};

export default AppLayout;
