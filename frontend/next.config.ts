import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // the old online-only registrations page now lives in the merged attendees page
  async redirects() {
    return [{ source: "/admin/online-reg", destination: "/admin/attendees", permanent: true }];
  },
  partialPrefetching: true,
};

export default nextConfig;
