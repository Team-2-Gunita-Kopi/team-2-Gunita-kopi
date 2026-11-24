import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { ExpirationPlugin, NetworkFirst, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

interface ServiceWorkerWindowClient {
  postMessage: (message: unknown) => void;
}

// Service worker scope declaration
declare const self: WorkerGlobalScope & {
  clients: {
    matchAll: (options?: {
      type?: string;
    }) => Promise<ServiceWorkerWindowClient[]>;
  };
  addEventListener: (
    type: string,
    listener: (event: { tag?: string }) => void,
  ) => void;
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // defaultCache's /api/ rule does not match the /staff basePath; same rule for /staff/api/.
  runtimeCaching: [
    {
      matcher: ({ sameOrigin, url }) =>
        sameOrigin && url.pathname.startsWith("/staff/api/"),
      method: "GET",
      handler: new NetworkFirst({
        cacheName: "apis",
        networkTimeoutSeconds: 10,
        plugins: [
          new ExpirationPlugin({ maxEntries: 16, maxAgeSeconds: 24 * 60 * 60, maxAgeFrom: "last-used" }),
        ],
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();

// Listen for Background Sync events
self.addEventListener("sync", (event: { tag?: string }) => {
  if (event.tag === "gunita-pos-sync-orders") {
    self.clients
      .matchAll({ type: "window" })
      .then((clients: ServiceWorkerWindowClient[]) => {
        for (const client of clients) {
          client.postMessage({ type: "TRIGGER_OUTBOX_SYNC" });
        }
      });
  }
});
