import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { processCall, getProcessingStatus } from "@/lib/services";

type RouteContext = {
  params: Promise<{ callId: string }>;
};

// POST /api/calls/[callId]/process - Trigger AI processing for a call
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
        summary: true,
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

    // Check if already has a summary
    if (call.summary) {
      return NextResponse.json(
        { error: "Call already has a summary", summaryId: call.summary.id },
        { status: 409 }
      );
    }

    // Check if we have enough uploads (at least 2)
    if (call.audioUploads.length < 2) {
      return NextResponse.json(
        {
          error: "Not enough audio uploads to process",
          uploadsCount: call.audioUploads.length,
          required: 2,
        },
        { status: 400 }
      );
    }

    // Check if status allows processing
    const allowedStatuses = ["AWAITING_UPLOADS", "PROCESSING", "FAILED"];
    if (!allowedStatuses.includes(call.status)) {
      return NextResponse.json(
        {
          error: `Cannot process call with status: ${call.status}`,
          currentStatus: call.status,
        },
        { status: 400 }
      );
    }

    // Process the call (this may take 30-60 seconds)
    console.log(`[API] Starting processing for call: ${callId}`);
    const result = await processCall(callId);

    if (result.success) {
      return NextResponse.json({
        message: "Processing complete",
        callId: result.callId,
        summary: result.summary,
      });
    } else {
      return NextResponse.json(
        {
          error: "Processing failed",
          callId: result.callId,
          details: result.error,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error processing call:", error);
    return NextResponse.json(
      { error: "Failed to process call" },
      { status: 500 }
    );
  }
}

// GET /api/calls/[callId]/process - Get processing status
export async function GET(request: NextRequest, context: RouteContext) {
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

    // Get processing status
    const status = await getProcessingStatus(callId);

    return NextResponse.json(status);
  } catch (error) {
    console.error("Error getting processing status:", error);
    return NextResponse.json(
      { error: "Failed to get processing status" },
      { status: 500 }
    );
  }
}
