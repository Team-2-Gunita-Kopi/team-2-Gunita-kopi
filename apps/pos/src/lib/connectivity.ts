"use client";

import { useEffect } from "react";
import { createStore, useStore } from "zustand";

type ConnectivityState = { browserOnline: boolean; simulatedOffline: boolean };

/** Module-level store so non-React code (mockRpc) can read connectivity. The simulated flag is memory-only. */
export const connectivityStore = createStore<ConnectivityState>(() => ({
  browserOnline: true,
  simulatedOffline: false,
}));

/** online = navigator.onLine && !simulatedOffline */
export function isOnline(): boolean {
  const s = connectivityStore.getState();
  return s.browserOnline && !s.simulatedOffline;
}

export function setSimulatedOffline(v: boolean): void {
  connectivityStore.setState({ simulatedOffline: v });
}

export function useConnectivity(): { online: boolean; simulatedOffline: boolean; setSimulatedOffline(v: boolean): void } {
  const browserOnline = useStore(connectivityStore, (s) => s.browserOnline);
  const simulatedOffline = useStore(connectivityStore, (s) => s.simulatedOffline);

  useEffect(() => {
    const sync = () => connectivityStore.setState({ browserOnline: navigator.onLine });
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return { online: browserOnline && !simulatedOffline, simulatedOffline, setSimulatedOffline };
}
