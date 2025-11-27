import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth";

type RouteContext = {
  params: Promise<{ callId: string }>;
};

// POST /api/calls/[callId]/confirm-upload - Confirm S3 upload completed
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { callId } = await context.params;
    const body = await request.json();
    const { s3Key, fileSize, durationSeconds, mimeType } = body;

    if (!s3Key) {
      return NextResponse.json({ error: "s3Key is required" }, { status: 400 });
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

    // Check if user already has an upload record
    const existingUpload = call.audioUploads.find(
      (u) => u.userId === session.user!.id
    );

    if (existingUpload) {
      return NextResponse.json(
        { error: "Audio already uploaded for this call" },
        { status: 409 }
      );
    }

    // Create audio upload record
    const audioUpload = await prisma.audioUpload.create({
      data: {
        callId: call.id,
        userId: session.user.id,
        filePath: s3Key,
        fileSize: fileSize || 0,
        durationSeconds: durationSeconds || null,
        mimeType: mimeType || "audio/webm",
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
      message: "Upload confirmed",
      audioUpload: {
        id: audioUpload.id,
        status: audioUpload.status,
        uploadedAt: audioUpload.uploadedAt,
      },
      allParticipantsUploaded,
      readyForProcessing: allParticipantsUploaded,
    });
  } catch (error) {
    console.error("Error confirming upload:", error);
    return NextResponse.json(
      { error: "Failed to confirm upload" },
      { status: 500 }
    );
  }
}
