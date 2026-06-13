import React, { useState } from 'react';
import { DailyGenusProvider } from '@/lib/dailyGenusContext';
import { HeroSpeciesProvider } from '@/lib/heroSpeciesContext';
import Navbar from './orchid/Navbar';
import HomeHero from './orchid/HomeHero';
import DailyGenusFeature from './orchid/DailyGenusFeatureV2';
import TheKnowledgeGraph from './orchid/TheKnowledgeGraph';
import CapabilityGrid from './orchid/CapabilityGrid';
import ContinuumWeb from './orchid/ContinuumWeb';
import SpeciesInFocus from './orchid/SpeciesInFocus';
import HomeAtlas from './orchid/HomeAtlas';
import WhyOrchidsMatter from './orchid/WhyOrchidsMatter';
import HumanStewardship from './orchid/HumanStewardship';
import OrchidGallery from './orchid/OrchidGallery';
import NewsFromContinuum from './orchid/NewsFromContinuum';
import Footer from './orchid/Footer';
import BackendHealthBanner from './orchid/BackendHealthBanner';
import BackendStatusBanner from './orchid/BackendStatusBanner';

type SectionBoundaryProps = {
  name: string;
  children: React.ReactNode;
};

type SectionBoundaryState = {
  hasError: boolean;
};

class SectionBoundary extends React.Component<SectionBoundaryProps, SectionBoundaryState> {
  state: SectionBoundaryState = { hasError: false };

  static getDerivedStateFromError(): SectionBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error(`[Orchid Continuum] ${this.props.name} failed`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="mx-auto my-8 max-w-5xl rounded-2xl border border-amber-300/40 bg-[#fff8e6] px-5 py-4 text-[#3a4630] shadow-sm">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#8a6f2d]">
            Orchid Continuum
          </p>
          <h2 className="mt-1 font-serif text-xl text-[#1a2e1a]">{this.props.name} is temporarily offline.</h2>
          <p className="mt-1 text-sm text-[#5d684c]">
            The rest of the site is still available while this live research module is repaired.
          </p>
        </section>
      );
    }

    return this.props.children;
  }
}

const SafeSection: React.FC<SectionBoundaryProps> = ({ name, children }) => (
  <SectionBoundary name={name}>{children}</SectionBoundary>
);

const AppLayout: React.FC = () => {
  const [bannerHeight, setBannerHeight] = useState(0);

  return (
    <div className="min-h-screen bg-[#1a2e1a] antialiased">
      <BackendStatusBanner onHeightChange={setBannerHeight} />

      <Navbar topOffset={bannerHeight} />

      <main style={{ paddingTop: bannerHeight }}>
        <DailyGenusProvider>
          <HeroSpeciesProvider>
            <SafeSection name="Home hero">
              <HomeHero />
            </SafeSection>

            <SafeSection name="Knowledge graph">
              <TheKnowledgeGraph />
            </SafeSection>

            <SafeSection name="Genus of the Day">
              <DailyGenusFeature />
            </SafeSection>

            <SafeSection name="Species in Focus">
              <SpeciesInFocus />
            </SafeSection>

            <SafeSection name="Orchid Gallery">
              <OrchidGallery />
            </SafeSection>

            <SafeSection name="Atlas">
              <HomeAtlas />
            </SafeSection>

            <SafeSection name="Continuum Web">
              <ContinuumWeb />
            </SafeSection>

            <SafeSection name="Identification matrix">
              <CapabilityGrid />
            </SafeSection>

            <SafeSection name="Why Orchids Matter">
              <WhyOrchidsMatter />
            </SafeSection>

            <SafeSection name="Human Stewardship">
              <HumanStewardship />
            </SafeSection>

            <SafeSection name="News from the Continuum">
              <NewsFromContinuum />
            </SafeSection>
          </HeroSpeciesProvider>
        </DailyGenusProvider>
      </main>

      <SafeSection name="Footer">
        <Footer />
      </SafeSection>

      <BackendHealthBanner />
    </div>
  );
};

export default AppLayout;
