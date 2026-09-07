/** Public editorial facts only. Evidence and update policy: docs/research-station-profile.md. */
export const researchStationProfile = {
  name: 'Jeffery Scott Parham',
  credential: 'M.S.',
  role: 'Founder & Scientific Lead',
  program: 'Orchid Continuum Research Station',
  canonicalPath: '/research-station/researchers/jeffery-scott-parham',
  canonicalUrl: 'https://orchidcontinuum.org/research-station/researchers/jeffery-scott-parham',
  title: 'Jeffery Scott Parham, M.S. | Orchid Continuum Research Station',
  description: 'Scientific lead profile, research directions, education, and public organizational contact for the Orchid Continuum Research Station, a program of the fiscally sponsored Orchid Continuum initiative.',
  reviewed: '2026-09-07',
  contactEmail: 'fcospresident@gmail.com',
  societyUrl: 'https://www.fcos.org/about-us',
  sponsorUrl: 'https://ecologistics.org/fiscal-sponsorship/sponsored-organizations/',
} as const;

export const researchStationStructuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'ProfilePage',
      '@id': researchStationProfile.canonicalUrl,
      url: researchStationProfile.canonicalUrl,
      name: researchStationProfile.title,
      description: researchStationProfile.description,
      dateModified: researchStationProfile.reviewed,
      mainEntity: { '@id': `${researchStationProfile.canonicalUrl}#person` },
    },
    {
      '@type': 'Person',
      '@id': `${researchStationProfile.canonicalUrl}#person`,
      name: researchStationProfile.name,
      honorificSuffix: researchStationProfile.credential,
      jobTitle: researchStationProfile.role,
      url: researchStationProfile.canonicalUrl,
      affiliation: [
        { '@type': 'Organization', name: researchStationProfile.program, url: 'https://orchidcontinuum.org/research-station' },
        { '@type': 'Organization', name: 'Five Cities Orchid Society', url: researchStationProfile.societyUrl },
      ],
      alumniOf: { '@type': 'CollegeOrUniversity', name: 'University of California, Riverside' },
    },
  ],
};
