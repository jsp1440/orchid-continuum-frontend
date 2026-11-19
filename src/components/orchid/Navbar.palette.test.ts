import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { expect, it } from 'vitest';
import config from '../../../tailwind.config';

it('actually emits the opacity colors used by navigation on a cream header', async () => {
  const css = await postcss([tailwindcss({ ...config, content: [{ raw: '<button class="text-charcoal/70 hover:text-forest text-charcoal/75">Home</button>' }] })]).process('@tailwind utilities;', { from: undefined });
  const rule = css.root.nodes.find(node => node.type === 'rule' && node.selector === '.text-charcoal\\/70');
  expect(rule?.toString()).toMatch(/color:\s*rgb\(58 54 48 \/ 0.7\)/);
  expect(css.css).toContain('.text-charcoal\\/75');
  expect(css.css).toContain('.hover\\:text-forest:hover');
});
