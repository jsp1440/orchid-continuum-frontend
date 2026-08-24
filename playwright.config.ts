import { defineConfig, devices } from "@playwright/test";

/**
 * Browser journey configuration.
 *
 * Two servers are started: a production build of the app served by `vite
 * preview`, and the local reference backend the app is pointed at. The build
 * is a real production bundle rather than the dev server, because a journey
 * that only ever passes under `vite dev` says nothing about what gets
 * deployed.
 *
 * `VITE_SUPABASE_URL` points identity at the same reference backend, so the
 * journey signs a throwaway account in without touching the hosted identity
 * project. That override is the reason this suite can exist at all.
 */
const REFERENCE_BACKEND = "http://127.0.0.1:8791";
const APP = "http://127.0.0.1:4173";

const buildEnv = {
  VITE_CALYX_API_URL: REFERENCE_BACKEND,
  VITE_SUPABASE_URL: REFERENCE_BACKEND,
  VITE_SUPABASE_ANON_KEY: "reference-backend-anon-key",
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 300_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  outputDir: "e2e/.artifacts",
  use: {
    baseURL: APP,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          // The image ships Chromium at a fixed path; let Playwright use it
          // rather than downloading a second copy that would not be there.
          executablePath:
            process.env.PLAYWRIGHT_CHROMIUM_PATH ||
            "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
        },
      },
    },
  ],
  webServer: [
    {
      command: "node e2e/support/reference-backend.mjs",
      url: `${REFERENCE_BACKEND}/__reference/health`,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "npm run build && npx vite preview --port 4173 --host 127.0.0.1 --strictPort",
      url: APP,
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
      env: buildEnv,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
