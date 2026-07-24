/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  images: {
    remotePatterns: [
      // Firebase Storage — CMS screenshots and hero images
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
      // OnWay server — images served via API
      {
        protocol: "https",
        hostname: "onwayiq.com",
      },
    ],
  },
};

export default nextConfig;
