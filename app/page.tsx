"use client";

import dynamic from "next/dynamic";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LogOut } from "lucide-react";
import Image from "next/image";

// Dynamically import VideoCall with SSR disabled to prevent hydration errors
const VideoCall = dynamic(() => import("./components/VideoCall"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <span className="text-white">Loading...</span>
    </div>
  ),
});

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Redirect to login if not authenticated
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <span className="text-white text-xl">Loading...</span>
      </div>
    );
  }

  if (!session) {
    return null; // Will redirect to login
  }

  return (
    <main className="relative min-h-screen bg-linear-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* User info and logout button */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-4">
        <div className="flex items-center gap-2 bg-gray-800 px-4 py-2 rounded-lg">
          {session.user?.image && (
            <Image
              src={session.user.image}
              alt="Profile"
              width={32}
              height={32}
              className="rounded-full"
            />
          )}
          <span className="text-white text-sm">{session.user?.name}</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>

      {/* Add top padding to prevent overlap with absolute positioned header */}
      <div className="pt-16">
        <VideoCall
          socketUrl={
            process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001"
          }
          userName={session.user?.name || "User"}
        />
      </div>
    </main>
  );
}
