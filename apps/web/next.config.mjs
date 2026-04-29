import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/ui"],
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
};

// Skip the Sentry webpack wrapper in CI — its source-map generation adds ~2-3 minutes
// to the build, blowing the Playwright webServer timeout. Runtime SDK still loads via
// instrumentation.ts / instrumentation-client.ts; only build-time source-map upload is
// disabled. Vercel deployments (where SENTRY_AUTH_TOKEN is set) keep the wrapper.
export default process.env.CI
  ? nextConfig
  : withSentryConfig(nextConfig, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
    });
