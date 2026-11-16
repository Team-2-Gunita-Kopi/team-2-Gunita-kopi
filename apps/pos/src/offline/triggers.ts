import { syncOutboxOrders } from "./sync";

export const SYNC_TAG = "gunita-pos-sync-orders";

/**
 * Registers the Service Worker Background Sync trigger if supported by the browser.
 */
export async function registerBackgroundSync(): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    // Check if SyncManager is available
    if ("sync" in registration) {
      const regWithSync = registration as unknown as {
        sync: { register: (tag: string) => Promise<void> };
      };
      await regWithSync.sync.register(SYNC_TAG);
      return true;
    }
  } catch (error) {
    console.warn(
      "[Sync Triggers] Background sync registration failed, using fallback:",
      error,
    );
  }
  return false;
}

/**
 * Initializes listeners for online status changes, window focus / app reopened,
 * and service worker messages.
 */
export function initSyncTriggers(onSyncComplete?: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleOnline = async () => {
    // TODO: Verify server health endpoint (/api/health) before initiating full sync
    await syncOutboxOrders();
    if (onSyncComplete) onSyncComplete();
  };

  const handleVisibilityChange = async () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      // App reopened / brought back to foreground
      await syncOutboxOrders();
      if (onSyncComplete) onSyncComplete();
    }
  };

  window.addEventListener("online", handleOnline);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  // Trigger sync on initial load if online
  if (navigator.onLine) {
    syncOutboxOrders().then(() => {
      if (onSyncComplete) onSyncComplete();
    });
  }

  // Cleanup handler
  return () => {
    window.removeEventListener("online", handleOnline);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
