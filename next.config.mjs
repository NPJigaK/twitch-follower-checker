/** @type {import('next').NextConfig} */
import nextra from "nextra";

const withNextra = nextra({
  theme: "nextra-theme-docs",
  themeConfig: "./theme.config.tsx",
});

const nextConfig = {
  reactStrictMode: true,
  // Configuration for enabling static export
  output: "export",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default withNextra(nextConfig);
