import type { NextConfig } from "next";

/* Local/standalone: normal Next server build. CI (GitHub Pages): set
 * STATIC_EXPORT=1 for a static export into out/. basePath must match the
 * repo name for project Pages sites — update it if the repo is renamed. */
const isStatic = !!process.env.STATIC_EXPORT;

const nextConfig: NextConfig = {
  ...(isStatic
    ? {
        output: "export" as const,
        basePath: "/canvas-template",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: false,
};

export default nextConfig;
