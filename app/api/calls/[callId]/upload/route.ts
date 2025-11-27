import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { uploadToS3, generateAudioKey } from "@/lib/s3";

type RouteContext = {
  params: Promise<{ callId: string }>;
};

// POST /api/calls/[callId]/upload - Upload audio file for a call
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { callId } = await context.params;

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

    // Parse the multipart form data
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;
    const durationSeconds = formData.get("duration") as string | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav"];
    if (!allowedTypes.includes(audioFile.type)) {
      return NextResponse.json(
        { error: "Invalid audio format. Allowed: webm, mp4, mpeg, wav" },
        { status: 400 }
      );
    }

    // Validate file size (max 100MB)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (audioFile.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 100MB" },
        { status: 400 }
      );
    }

    // Get file extension from mime type
    const extensionMap: Record<string, string> = {
      "audio/webm": "webm",
      "audio/mp4": "m4a",
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
    };
    const extension = extensionMap[audioFile.type] || "webm";

    // Generate S3 key and upload
    const s3Key = generateAudioKey(callId, session.user.id, extension);
    const buffer = Buffer.from(await audioFile.arrayBuffer());

    await uploadToS3(s3Key, buffer, audioFile.type);

    // Create audio upload record
    const audioUpload = await prisma.audioUpload.create({
      data: {
        callId: call.id,
        userId: session.user.id,
        filePath: s3Key,
        fileSize: audioFile.size,
        durationSeconds: durationSeconds ? parseFloat(durationSeconds) : null,
        mimeType: audioFile.type,
        status: "PENDING",
      },
    });

    // Check if both participants have uploaded
    const allUploads = await prisma.audioUpload.findMany({
      where: { callId: call.id },
    });

    const allParticipantsUploaded =
      allUploads.length >= call.participants.length;

    // Update call status if all uploads received
    if (allParticipantsUploaded) {
      await prisma.call.update({
        where: { id: call.id },
        data: { status: "PROCESSING" },
      });
    }

    return NextResponse.json({
      message: "Audio uploaded successfully",
      audioUpload: {
        id: audioUpload.id,
        status: audioUpload.status,
        uploadedAt: audioUpload.uploadedAt,
      },
      allParticipantsUploaded,
      readyForProcessing: allParticipantsUploaded,
    });
  } catch (error) {
    console.error("Error uploading audio:", error);
    return NextResponse.json(
      { error: "Failed to upload audio" },
      { status: 500 }
    );
  }
}
