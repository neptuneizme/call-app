import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { processCall } from "@/lib/services";

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

    // Create audio upload record with UPLOADED status (file is in S3)
    const audioUpload = await prisma.audioUpload.create({
      data: {
        callId: call.id,
        userId: session.user.id,
        filePath: s3Key,
        fileSize: fileSize || 0,
        durationSeconds: durationSeconds || null,
        mimeType: mimeType || "audio/webm",
        status: "PENDING", // Will be set to PROCESSING when transcription starts
      },
    });

    console.log(
      `[ConfirmUpload] Created upload record for user ${session.user.id}, callId: ${callId}, s3Key: ${s3Key}`
    );

    // Check if both participants have uploaded
    // Use a fresh query to avoid race conditions
    const allUploads = await prisma.audioUpload.findMany({
      where: { callId: call.id },
    });

    console.log(
      `[ConfirmUpload] Total uploads for call ${callId}: ${allUploads.length}/${call.participants.length}`
    );
    allUploads.forEach((u) => {
      console.log(
        `  - Upload ${u.id}: user=${u.userId}, status=${u.status}, path=${u.filePath}`
      );
    });

    const allParticipantsUploaded =
      allUploads.length >= call.participants.length;

    console.log(
      `[ConfirmUpload] allParticipantsUploaded: ${allParticipantsUploaded}`
    );

    // Update call status if all uploads received
    if (allParticipantsUploaded) {
      console.log(`[ConfirmUpload] Updating call status to PROCESSING...`);
      await prisma.call.update({
        where: { id: call.id },
        data: { status: "PROCESSING" },
      });
      console.log(`[ConfirmUpload] Call status updated to PROCESSING`);

      // Auto-trigger AI processing in background
      // We don't await this to return response quickly
      // The processing runs asynchronously
      console.log(
        `[ConfirmUpload] All uploads received for ${callId}, triggering processing...`
      );

      processCall(callId)
        .then((result) => {
          if (result.success) {
            console.log(`[ConfirmUpload] Processing complete for ${callId}`);
          } else {
            console.error(
              `[ConfirmUpload] Processing failed for ${callId}:`,
              result.error
            );
          }
        })
        .catch((err) => {
          console.error(`[ConfirmUpload] Processing error for ${callId}:`, err);
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
      processingStarted: allParticipantsUploaded,
    });
  } catch (error) {
    console.error("Error confirming upload:", error);
    return NextResponse.json(
      { error: "Failed to confirm upload" },
      { status: 500 }
    );
  }
}
