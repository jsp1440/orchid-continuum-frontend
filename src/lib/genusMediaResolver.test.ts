import { describe, it, expect } from 'vitest';
import { fetchCalyxGenusMedia } from './genusMediaResolver';

describe('genusMediaResolver', () => {
  it('exports fetchCalyxGenusMedia as a function', () => {
    expect(typeof fetchCalyxGenusMedia).toBe('function');
  });
});
