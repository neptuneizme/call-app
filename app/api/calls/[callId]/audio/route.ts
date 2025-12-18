import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getPresignedDownloadUrl } from "@/lib/s3";

type RouteContext = {
  params: Promise<{ callId: string }>;
};

// GET /api/calls/[callId]/audio - Get download URLs for audio files
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { callId } = await context.params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId"); // Optional: get specific user's audio

    // Find the call
    const call = await prisma.call.findUnique({
      where: { callId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        audioUploads: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    // Check if user is a participant
    const isParticipant = call.participants.some(
      (p) => p.userId === session.user!.id
    );

    if (!isParticipant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if merged audio exists
    if (!call.mergedAudioPath) {
      return NextResponse.json(
        { error: "Merged audio not available for this call" },
        { status: 404 }
      );
    }

    // Generate presigned download URL for merged audio
    const mergedAudioUrl = await getPresignedDownloadUrl(
      call.mergedAudioPath,
      3600 // 1 hour expiry
    );

    return NextResponse.json({
      callId: call.callId,
      mergedAudioUrl,
      mergedAudioPath: call.mergedAudioPath,
    });
  } catch (error) {
    console.error("Error fetching audio files:", error);
    return NextResponse.json(
      { error: "Failed to fetch audio files" },
      { status: 500 }
    );
  }
}
