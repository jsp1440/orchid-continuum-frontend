import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import { AppProvider } from '@/contexts/AppContext';
import { DailyGenusProvider } from '@/lib/dailyGenusContext';
import FeaturedGenusExperience from '@/features/homepage-recovery/FeaturedGenusExperience';
import HomepageAtlasExperience from '@/features/homepage-recovery/HomepageAtlasExperience';
import '@/features/homepage-recovery/recovery.css';

export default function HomepageRecoveryPreview() {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === '#featured-genus') document.getElementById('featured-genus')?.scrollIntoView();
  }, [hash]);

  return <AppProvider><DailyGenusProvider><div className="homepage-recovery"><Navbar />
    <main id="main-content"><div className="recovery-preview-label">Design recovery preview · Reconstructed from the original homepage and Brain blueprints</div>
      <header className="recovery-opening"><div className="recovery-width"><p className="recovery-kicker">Orchid Continuum</p>
        <h1>Discover the hidden relationships that connect orchids to the living world.</h1>
        <div className="recovery-opening-bottom"><p>A photograph. A field record. A scientific paper. Follow these pieces of evidence into a connected understanding of orchids, their environments, and the life around them.</p>
          <a href="#featured-genus">Begin with a living genus <span aria-hidden="true">↓</span></a></div>
      </div></header>
      <FeaturedGenusExperience /><HomepageAtlasExperience />
      <section className="recovery-width recovery-calyx"><p className="recovery-kicker">Make sense of the connections</p><h2>Explore with Calyx.</h2>
        <p>Bring your questions to the evidence. Explore documented relationships, trace their sources, and see where knowledge is still incomplete.</p><Link to="/speak-with-calyx">Meet Calyx ↗</Link>
      </section>
    </main><Footer /></div></DailyGenusProvider></AppProvider>;
}
