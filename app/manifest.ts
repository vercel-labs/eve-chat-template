import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#000000",
    description: "Build your own autonomous agent with eve.",
    display: "standalone",
    icons: [
      {
        sizes: "192x192",
        src: "/icon.svg",
        type: "image/svg+xml",
      },
      {
        sizes: "512x512",
        src: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    name: "eve Agent",
    short_name: "eve",
    start_url: "/",
    theme_color: "#000000",
  };
}
