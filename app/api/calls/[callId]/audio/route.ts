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

    // Filter uploads if userId specified
    let uploads = call.audioUploads;
    if (userId) {
      uploads = uploads.filter((u) => u.userId === userId);
    }

    // Generate presigned download URLs
    const audioFiles = await Promise.all(
      uploads.map(async (upload) => {
        const downloadUrl = await getPresignedDownloadUrl(
          upload.filePath,
          3600 // 1 hour expiry
        );

        return {
          id: upload.id,
          oderId: upload.userId,
          userName: upload.user.name,
          downloadUrl,
          fileSize: upload.fileSize,
          durationSeconds: upload.durationSeconds,
          mimeType: upload.mimeType,
          uploadedAt: upload.uploadedAt,
        };
      })
    );

    return NextResponse.json({
      callId: call.callId,
      audioFiles,
    });
  } catch (error) {
    console.error("Error fetching audio files:", error);
    return NextResponse.json(
      { error: "Failed to fetch audio files" },
      { status: 500 }
    );
  }
}
