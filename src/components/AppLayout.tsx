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
  errorMessage: string;
  errorStack: string;
};

class SectionBoundary extends React.Component<SectionBoundaryProps, SectionBoundaryState> {
  state: SectionBoundaryState = {
    hasError: false,
    errorMessage: '',
    errorStack: '',
  };

  static getDerivedStateFromError(error: Error): SectionBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || String(error),
      errorStack: error?.stack || '',
    };
  }

  componentDidCatch(error: Error) {
    console.error(`[Orchid Continuum] ${this.props.name} failed`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="mx-auto my-8 max-w-5xl rounded-2xl border border-red-400 bg-red-50 px-5 py-4 text-red-950 shadow-sm">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-red-700">
            Orchid Continuum Diagnostic
          </p>
          <h2 className="mt-1 font-serif text-xl font-bold">
            {this.props.name} crashed
          </h2>
          <pre className="mt-3 whitespace-pre-wrap rounded bg-white p-3 text-xs leading-5 text-black">
            {this.state.errorMessage}
            {'\n\n'}
            {this.state.errorStack}
          </pre>
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
            <SafeSection name="Home hero"><HomeHero /></SafeSection>
            <SafeSection name="Knowledge graph"><TheKnowledgeGraph /></SafeSection>
            <SafeSection name="Genus of the Day"><DailyGenusFeature /></SafeSection>
            <SafeSection name="Species in Focus"><SpeciesInFocus /></SafeSection>
            <SafeSection name="Orchid Gallery"><OrchidGallery /></SafeSection>
            <SafeSection name="Atlas"><HomeAtlas /></SafeSection>
            <SafeSection name="Continuum Web"><ContinuumWeb /></SafeSection>
            <SafeSection name="Identification matrix"><CapabilityGrid /></SafeSection>
            <SafeSection name="Why Orchids Matter"><WhyOrchidsMatter /></SafeSection>
            <SafeSection name="Human Stewardship"><HumanStewardship /></SafeSection>
            <SafeSection name="News from the Continuum"><NewsFromContinuum /></SafeSection>
          </HeroSpeciesProvider>
        </DailyGenusProvider>
      </main>

      <SafeSection name="Footer"><Footer /></SafeSection>
      <BackendHealthBanner />
    </div>
  );
};

export default AppLayout;
