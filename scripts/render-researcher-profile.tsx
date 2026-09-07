import React from 'react';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import ResearchStationProfile from '../src/components/research/ResearchStationProfile';
import { researchStationProfile as profile, researchStationStructuredData } from '../src/content/researchStationProfile';

export function renderProfileDocument() {
  const structuredData = JSON.stringify(researchStationStructuredData).replaceAll('<', '\\u003c');
  return '<!doctype html>\n' + renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{profile.title}</title>
        <meta name="description" content={profile.description} />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href={profile.canonicalUrl} />
        <meta property="og:title" content={profile.title} />
        <meta property="og:description" content={profile.description} />
        <meta property="og:type" content="profile" />
        <meta property="og:url" content={profile.canonicalUrl} />
        <link rel="stylesheet" href="/research-station-profile.css" />
        <style>{'html, body { margin: 0; padding: 0; }'}</style>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
      </head>
      <body><ResearchStationProfile /></body>
    </html>,
  ) + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const destination = new URL('../public/researcher-jeffery-scott-parham.html', import.meta.url);
  const html = renderProfileDocument();
  if (process.argv.includes('--check')) {
    if (readFileSync(destination, 'utf8') !== html) {
      throw new Error('Public profile is stale. Run npm run generate:research-profile.');
    }
    console.log('Public profile matches the shared React source.');
  } else {
    writeFileSync(destination, html);
    console.log('Generated the public Research Station profile.');
  }
}
