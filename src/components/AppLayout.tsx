import React from 'react';
import HomeSpeciesExhibit from '@/components/orchid/HomeSpeciesExhibit';
import { DailyGenusProvider } from '@/lib/dailyGenusContext';
import { HeroSpeciesProvider } from '@/lib/heroSpeciesContext';
import Navbar from './orchid/Navbar';
import HeroOrchid from './orchid/HeroOrchid';
import ContinuumThread from './orchid/ContinuumThread';
import FungalDependency from './orchid/FungalDependency';
import DailyGenusFeature from './orchid/DailyGenusFeature';
import ContinuumWeb from './orchid/ContinuumWeb';
import HomeAtlasContinuum from './orchid/HomeAtlasContinuum';
import PublicCalyxGuide from './orchid/PublicCalyxGuide';
import HomepageStewardshipClose from './orchid/HomepageStewardshipClose';
import Footer from './orchid/Footer';

type SectionBoundaryProps = {
  name: string;
  children: React.ReactNode;
};

type SectionBoundaryState = {
  hasError: boolean;
};

class SectionBoundary extends React.Component<SectionBoundaryProps, SectionBoundaryState> {
  state: SectionBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): SectionBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    // Preserve diagnostic detail for developers without exposing exception
    // messages or stack traces in the public scientific experience.
    console.error(`[Orchid Continuum] ${this.props.name} failed`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section
          className="mx-auto my-8 max-w-5xl rounded-2xl border border-[#d9caa8] bg-[#fffaf0] px-5 py-5 text-[#3a4630] shadow-sm"
          role="status"
        >
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#8a6f2d]">
            Continuum section unavailable
          </p>
          <h2 className="mt-2 font-serif text-xl text-[#24321f]">
            {this.props.name} could not be displayed.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5d684c]">
            This section is temporarily unavailable. No scientific fallback content has been substituted.
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
  // The species the hero photograph actually names, so the dependency section
  // asks about the same orchid the visitor is looking at.
  const [heroSpecies, setHeroSpecies] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-[#1a2e1a] antialiased">
      <Navbar />

      <main>
        <DailyGenusProvider>
          <HeroSpeciesProvider>
            {/* HOMEPAGE-SLICE-1: one orchid, then one dependency, joined by a thread. */}
            <SafeSection name="Home hero"><HeroOrchid onSpeciesResolved={setHeroSpecies} /></SafeSection>
            <ContinuumThread />
            <SafeSection name="First dependency"><FungalDependency heroSpecies={heroSpecies} /></SafeSection>

            <div id="species-in-focus">
              <SafeSection name="Genus of the Day"><DailyGenusFeature /></SafeSection>
              <SafeSection name="Species evidence"><HomeSpeciesExhibit /></SafeSection>
            </div>

            <SafeSection name="Continuum relationships"><ContinuumWeb /></SafeSection>

            <div id="home-atlas">
              <SafeSection name="Atlas"><HomeAtlasContinuum /></SafeSection>
            </div>

            <div id="home-calyx">
              <SafeSection name="Calyx public guide"><PublicCalyxGuide /></SafeSection>
            </div>

            <SafeSection name="Stewardship"><HomepageStewardshipClose /></SafeSection>
          </HeroSpeciesProvider>
        </DailyGenusProvider>
      </main>

      <SafeSection name="Footer"><Footer /></SafeSection>
    </div>
  );
};

export default AppLayout;
