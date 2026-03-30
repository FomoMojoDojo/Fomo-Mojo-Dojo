import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const isVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Vercel expects the default ".next" output folder for Next.js framework builds.
  ...(isVercel ? {} : { distDir: isDev ? ".next-dev" : ".next-build" }),
};

export default nextConfig;
