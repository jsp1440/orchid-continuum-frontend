import { useEffect } from 'react';
import ResearchStationProfile from '../components/research/ResearchStationProfile';
import { researchStationProfile as profile, researchStationStructuredData } from '../content/researchStationProfile';
import '../../public/research-station-profile.css';

export default function ResearcherJefferyParham() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = profile.title;
    const restore: Array<() => void> = [];
    const setHead = (selector: string, create: () => HTMLElement, attribute: string, value: string) => {
      const existing = document.head.querySelector<HTMLElement>(selector);
      const element = existing ?? create();
      const previous = element.getAttribute(attribute);
      element.setAttribute(attribute, value);
      if (!existing) document.head.appendChild(element);
      restore.push(() => {
        if (!existing) element.remove();
        else if (previous === null) element.removeAttribute(attribute);
        else element.setAttribute(attribute, previous);
      });
    };

    for (const [name, content] of [
      ['description', profile.description],
      ['og:title', profile.title],
      ['og:description', profile.description],
      ['og:url', profile.canonicalUrl],
      ['og:type', 'profile'],
    ]) {
      const attribute = name.startsWith('og:') ? 'property' : 'name';
      setHead(`meta[${attribute}="${name}"]`, () => {
        const element = document.createElement('meta');
        element.setAttribute(attribute, name);
        return element;
      }, 'content', content);
    }
    setHead('link[rel="canonical"]', () => {
      const element = document.createElement('link');
      element.rel = 'canonical';
      return element;
    }, 'href', profile.canonicalUrl);

    const structuredData = document.createElement('script');
    structuredData.type = 'application/ld+json';
    structuredData.dataset.researcherProfile = 'jeffery-scott-parham';
    structuredData.textContent = JSON.stringify(researchStationStructuredData);
    document.head.appendChild(structuredData);

    return () => {
      document.title = previousTitle;
      restore.forEach(undo => undo());
      structuredData.remove();
    };
  }, []);

  return <ResearchStationProfile />;
}
