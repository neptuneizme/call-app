import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getPresignedUploadUrl, generateAudioKey } from "@/lib/s3";

type RouteContext = {
  params: Promise<{ callId: string }>;
};

// POST /api/calls/[callId]/presign - Get presigned URL for direct S3 upload
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { callId } = await context.params;
    const body = await request.json();
    const { contentType, fileExtension } = body;

    // Validate content type
    const allowedTypes = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav"];
    if (!allowedTypes.includes(contentType)) {
      return NextResponse.json(
        { error: "Invalid audio format" },
        { status: 400 }
      );
    }

    // Find the call and verify user is a participant
    const call = await prisma.call.findUnique({
      where: { callId },
      include: {
        participants: true,
        audioUploads: true,
      },
    });

    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    const isParticipant = call.participants.some(
      (p) => p.userId === session.user!.id
    );

    if (!isParticipant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if user already uploaded for this call
    const existingUpload = call.audioUploads.find(
      (u) => u.userId === session.user!.id
    );

    if (existingUpload) {
      return NextResponse.json(
        { error: "Audio already uploaded for this call" },
        { status: 409 }
      );
    }

    // Generate S3 key
    const extension = fileExtension || "webm";
    const s3Key = generateAudioKey(callId, session.user.id, extension);

    // Get presigned URL (valid for 1 hour)
    const presignedUrl = await getPresignedUploadUrl(s3Key, contentType, 3600);

    return NextResponse.json({
      presignedUrl,
      s3Key,
      expiresIn: 3600,
    });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}
