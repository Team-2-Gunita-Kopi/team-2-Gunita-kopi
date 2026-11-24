import { MetadataRoute } from "next";
import { BASE_PATH, withBasePath } from "@/staff/lib/base-path";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gunita Kopi POS",
    short_name: "Gunita POS",
    description: "Offline-First Point of Sale for Gunita Kopi Baristas",
    start_url: withBasePath("/staff/pos"),
    scope: `${BASE_PATH}/`,
    display: "standalone",
    background_color: "#0F1410",
    theme_color: "#0F1410",
    icons: [
      {
        src: withBasePath("/icons/icon-192.png"),
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: withBasePath("/icons/icon-512.png"),
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
