import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.32.1.77", "192.168.1.35", "192.168.1.45"],
  serverExternalPackages: ["pdf-parse", "sharp", "tesseract.js"],
  outputFileTracingIncludes: {
    "/api/parse-pdf": [
      "./node_modules/pdf-parse/dist/**/*",
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
    ],
  },
};

export default nextConfig;
