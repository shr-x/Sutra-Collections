/** @type {import('next').NextConfig} */
const nextConfig = {
  // Logo uploads are served as plain <img> tags (no Next.js optimizer involved),
  // so no remotePatterns / localPatterns config is required here.
  // Files written to /app/public/uploads/ are served at /uploads/* by Next.js's
  // built-in static file handler at runtime (not baked into the build).
};

module.exports = nextConfig;
