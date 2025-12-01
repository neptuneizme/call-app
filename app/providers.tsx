"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import { SWRConfig } from "swr";
import { fetcher } from "@/lib/fetcher";

interface ProvidersProps {
  children: ReactNode;
}

export default function Providers({ children }: ProvidersProps) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        dedupingInterval: 2000,
        errorRetryCount: 3,
        errorRetryInterval: 5000,
      }}
    >
      <SessionProvider>{children}</SessionProvider>
    </SWRConfig>
  );
}
