// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import FallbackImage from '@/components/orchid/FallbackImage';
import { isBrowserEmbeddableImageUrl } from './embeddableImageUrl';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('isBrowserEmbeddableImageUrl', () => {
  it('accepts absolute http(s) URLs on ordinary hosts', () => {
    expect(isBrowserEmbeddableImageUrl('https://inaturalist-open-data.s3.amazonaws.com/photos/1/medium.jpg')).toBe(true);
    expect(isBrowserEmbeddableImageUrl('http://example.org/a.jpg')).toBe(true);
  });

  it('rejects relative and protocol-less paths', () => {
    expect(isBrowserEmbeddableImageUrl('/orchids/images/2006-08/PICT1015.JPG')).toBe(false);
    expect(isBrowserEmbeddableImageUrl('//cdn.example.org/a.jpg')).toBe(false);
    expect(isBrowserEmbeddableImageUrl('PICT1015.JPG')).toBe(false);
  });

  it('rejects hosts that block cross-origin embedding (EOL), including subdomains', () => {
    expect(isBrowserEmbeddableImageUrl('https://content.eol.org/data/media/00/05/a0/8.13562091895.jpg')).toBe(false);
    expect(isBrowserEmbeddableImageUrl('https://CONTENT.EOL.ORG/x.jpg')).toBe(false);
    expect(isBrowserEmbeddableImageUrl('https://cdn.content.eol.org/x.jpg')).toBe(false);
  });

  it('does not reject lookalike hosts', () => {
    expect(isBrowserEmbeddableImageUrl('https://noteol.org/x.jpg')).toBe(true);
    expect(isBrowserEmbeddableImageUrl('https://content.eol.org.example.com/x.jpg')).toBe(true);
    expect(isBrowserEmbeddableImageUrl('https://content.eol.org.example.com./x.jpg')).toBe(true);
    expect(isBrowserEmbeddableImageUrl('https://noteol.org./x.jpg')).toBe(true);
  });

  it.each([
    'https://content.eol.org./a.jpg',
    'https://CONTENT.EOL.ORG./a.jpg',
    'https://cdn.content.eol.org./a.jpg',
    'https://CDN.CONTENT.EOL.ORG.:443/a.jpg',
    'http://content.eol.org.:8080/a.jpg',
  ])('rejects the blocked DNS root-dot form %s', (url) => {
    expect(isBrowserEmbeddableImageUrl(url)).toBe(false);
  });

  it('skips a terminal-dot blocked candidate before mounting the image', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      act(() => root.render(React.createElement(FallbackImage, {
        urls: ['https://cdn.content.eol.org./a.jpg', 'https://photos.example/usable.jpg'],
        alt: 'Living orchid',
      })));
      expect(host.querySelector('img')?.src).toBe('https://photos.example/usable.jpg');
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });

  it('rejects non-strings and malformed URLs', () => {
    expect(isBrowserEmbeddableImageUrl(undefined)).toBe(false);
    expect(isBrowserEmbeddableImageUrl(42)).toBe(false);
    expect(isBrowserEmbeddableImageUrl('https://')).toBe(false);
  });
});
