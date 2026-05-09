import type { NextConfig } from "next";

const basePath = "/eseltokens";

const nextConfig: NextConfig = {
  basePath,
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  allowedDevOrigins: ['192.168.2.177'],
  // eventuell temporär:
  // typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
