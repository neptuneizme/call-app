import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { deleteFromS3 } from "@/lib/s3";

type RouteContext = {
  params: Promise<{ callId: string }>;
};

// GET /api/calls/[callId] - Get a specific call
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { callId } = await context.params;

    const call = await prisma.call.findUnique({
      where: { callId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
        audioUploads: {
          select: {
            id: true,
            userId: true,
            status: true,
            uploadedAt: true,
          },
        },
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

    return NextResponse.json(call);
  } catch (error) {
    console.error("Error fetching call:", error);
    return NextResponse.json(
      { error: "Failed to fetch call" },
      { status: 500 }
    );
  }
}

// PATCH /api/calls/[callId] - Update call (end call, update status)
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { callId } = await context.params;
    const body = await request.json();
    const { status, endCall } = body;

    // Find the call and verify user is a participant
    const existingCall = await prisma.call.findUnique({
      where: { callId },
      include: {
        participants: true,
      },
    });

    if (!existingCall) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    const isParticipant = existingCall.participants.some(
      (p) => p.userId === session.user!.id
    );

    if (!isParticipant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Build update data
    const updateData: Prisma.CallUpdateInput = {};

    if (endCall) {
      updateData.endedAt = new Date();
      updateData.status = "AWAITING_UPLOADS";

      // Update participant's leftAt
      await prisma.callParticipant.updateMany({
        where: {
          callId: existingCall.id,
          userId: session.user.id,
          leftAt: null,
        },
        data: {
          leftAt: new Date(),
        },
      });
    }

    if (status) {
      // Validate status transition
      const validStatuses = [
        "IN_PROGRESS",
        "AWAITING_UPLOADS",
        "PROCESSING",
        "COMPLETED",
        "FAILED",
      ];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updateData.status = status;
    }

    const updatedCall = await prisma.call.update({
      where: { id: existingCall.id },
      data: updateData,
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
        summary: {
          select: {
            id: true,
            generatedAt: true,
          },
        },
      },
    });

    return NextResponse.json(updatedCall);
  } catch (error) {
    console.error("Error updating call:", error);
    return NextResponse.json(
      { error: "Failed to update call" },
      { status: 500 }
    );
  }
}

// DELETE /api/calls/[callId] - Delete a call and its associated data
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { callId } = await context.params;

    // Find the call with audio uploads
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

    // Check if user is a participant
    const isParticipant = call.participants.some(
      (p) => p.userId === session.user!.id
    );

    if (!isParticipant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete audio files from S3
    const deletePromises = call.audioUploads.map((upload) =>
      deleteFromS3(upload.filePath).catch((err) => {
        console.error(`Failed to delete S3 file: ${upload.filePath}`, err);
        // Continue even if S3 delete fails
      })
    );

    await Promise.all(deletePromises);

    // Delete call from database (cascades to participants, uploads, summary)
    await prisma.call.delete({
      where: { id: call.id },
    });

    return NextResponse.json({ message: "Call deleted successfully" });
  } catch (error) {
    console.error("Error deleting call:", error);
    return NextResponse.json(
      { error: "Failed to delete call" },
      { status: 500 }
    );
  }
}
