/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['docusign-esign', '@sparticuz/chromium'],
  outputFileTracingIncludes: {
    '/api/agreements': ['node_modules/@sparticuz/chromium/bin/**/*'],
  },
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
