import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      ...["3f69afb974a1e83f66a36f7618f88a38c254034b.wasm","b565ab0b474e8e557d954694b7379a57db669ac9.gz"].map(file=>({
        source:`/vendor/tikzjax/${file}`,
        headers:[{key:"Cache-Control",value:"public, max-age=31536000, immutable"}],
      })),
    ];
  },
};
export default config;
