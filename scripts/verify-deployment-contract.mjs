import { readFile } from 'node:fs/promises';

const requiredRoutes = [
  '/university',
  '/university/lab',
  '/conservatory/*',
  '/mission-control',
  '/calyx',
];

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

async function main() {
  const [app, redirects, vercel] = await Promise.all([
    read('src/App.tsx'),
    read('public/_redirects'),
    read('vercel.json'),
  ]);

  const failures = [];

  for (const route of requiredRoutes) {
    const routeLiteral = `path=\"${route}\"`;
    if (!app.includes(routeLiteral)) {
      failures.push(`Missing React route: ${route}`);
    }
  }

  if (!redirects.includes('/* /index.html 200')) {
    failures.push('public/_redirects does not contain the SPA fallback');
  }

  const vercelConfig = JSON.parse(vercel);
  const hasIndexRewrite = Array.isArray(vercelConfig.rewrites)
    && vercelConfig.rewrites.some((rewrite) => rewrite.destination === '/index.html');
  if (!hasIndexRewrite) {
    failures.push('vercel.json does not contain an index.html SPA rewrite');
  }

  if (failures.length > 0) {
    console.error('Deployment contract validation failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log('Deployment contract valid.');
  console.log(`Verified ${requiredRoutes.length} critical client routes and two SPA fallback mechanisms.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
