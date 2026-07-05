/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow next/image (if ever used) to serve images from the production domain and localhost.
  // Plain <img> tags are unaffected; this only gates the <Image> optimizer.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'sutra-pos.shr-x.in' },
      { protocol: 'https', hostname: 'shr-x.in' },
      { protocol: 'http',  hostname: 'localhost' },
    ],
  },
};

module.exports = nextConfig;
