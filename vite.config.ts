import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const FULL_GIT_SHA = /^[0-9a-f]{40}$/;

function resolveReleaseSha(): string {
  const configured = (
    process.env.VITE_RELEASE_SHA ||
    process.env.RENDER_GIT_COMMIT ||
    process.env.GITHUB_SHA ||
    ""
  ).trim().toLowerCase();
  if (FULL_GIT_SHA.test(configured)) return configured;

  try {
    const gitSha = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim().toLowerCase();
    if (FULL_GIT_SHA.test(gitSha)) return gitSha;
  } catch {
    // Local/non-Git builds remain usable, but production verification fails closed.
  }
  return "unattested";
}

// https://vitejs.dev/config/
export default defineConfig(() => {
  const releaseSha = resolveReleaseSha();
  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
      {
        name: "ocu-release-identity",
        transformIndexHtml(html: string) {
          return html.replaceAll("%OCU_RELEASE_SHA%", releaseSha);
        },
      },
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    test: {
      globals: true,
      environment: "node",
      testTimeout: 15000,
      // The browser journey is driven by Playwright, not Vitest. Without this
      // Vitest collects the spec, fails to resolve @playwright/test's runner,
      // and reports a red suite for a file it was never meant to run.
      exclude: ["node_modules/**", "dist/**", "e2e/**"],
    },
  };
});
