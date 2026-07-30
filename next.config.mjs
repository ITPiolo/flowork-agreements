/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['docusign-esign', '@sparticuz/chromium'],
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
