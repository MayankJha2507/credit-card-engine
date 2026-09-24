/** @type {import('next').NextConfig} */
const nextConfig = {
  // This repo sits inside a directory that has its own lockfile higher up.
  outputFileTracingRoot: import.meta.dirname,
  serverExternalPackages: ['postgres'],
};
export default nextConfig;
