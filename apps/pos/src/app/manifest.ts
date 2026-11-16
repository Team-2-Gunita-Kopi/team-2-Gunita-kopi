import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gunita Kopi POS",
    short_name: "Gunita POS",
    description: "Offline-First Point of Sale for Gunita Kopi Baristas",
    start_url: "/pos",
    display: "standalone",
    background_color: "#0F1410",
    theme_color: "#0F1410",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
