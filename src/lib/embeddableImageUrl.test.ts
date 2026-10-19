import { describe, expect, it } from 'vitest';
import { isBrowserEmbeddableImageUrl } from './embeddableImageUrl';

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
  });

  it('rejects non-strings and malformed URLs', () => {
    expect(isBrowserEmbeddableImageUrl(undefined)).toBe(false);
    expect(isBrowserEmbeddableImageUrl(42)).toBe(false);
    expect(isBrowserEmbeddableImageUrl('https://')).toBe(false);
  });
});
