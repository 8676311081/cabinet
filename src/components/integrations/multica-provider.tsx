"use client";

import dynamic from "next/dynamic";
import { useCallback, type ReactNode } from "react";
import { getCabinetDesktop, multicaStorage } from "@/lib/electron-desktop";

const CoreProvider = dynamic(
  () => import("@multica/core/platform").then((m) => m.CoreProvider),
  { ssr: false }
);

type MulticaProviderProps = {
  children: ReactNode;
};

export function MulticaProvider({ children }: MulticaProviderProps) {
  const desktop = getCabinetDesktop();
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_MULTICA_API_URL || "/multica-api";
  const wsUrl =
    desktop?.multicaWsUrl ||
    process.env.NEXT_PUBLIC_MULTICA_WS_URL ||
    "ws://localhost:18080/ws";

  const onLogin = useCallback(() => {
    document.cookie = "multica-authed=1; path=/; max-age=2592000; SameSite=Lax";
  }, []);

  const onLogout = useCallback(() => {
    document.cookie = "multica-authed=; path=/; max-age=0";
  }, []);

  return (
    <CoreProvider
      apiBaseUrl={apiBaseUrl}
      wsUrl={wsUrl}
      storage={multicaStorage}
      onLogin={onLogin}
      onLogout={onLogout}
    >
      {children}
    </CoreProvider>
  );
}
