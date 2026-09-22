import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Trust the auth proxy's forwarded headers for correct URL generation. */
  poweredByHeader: false,
  skipTrailingSlashRedirect: true,
};

export default nextConfig;