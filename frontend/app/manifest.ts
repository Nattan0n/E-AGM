import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "E-AGM — ระบบประชุมผู้ถือหุ้น",
    short_name: "E-AGM",
    start_url: "/",
    display: "standalone",
    background_color: "#0b2a8f",
    theme_color: "#0b2a8f",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
