import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth";

type RouteContext = {
  params: Promise<{ callId: string }>;
};

// POST /api/calls/[callId]/join - Join an existing call
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { callId } = await context.params;

    // Find the call
    const call = await prisma.call.findUnique({
      where: { callId },
      include: {
        participants: true,
      },
    });

    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    // Check if call is still in progress
    if (call.status !== "IN_PROGRESS") {
      return NextResponse.json(
        { error: "Call is no longer active" },
        { status: 400 }
      );
    }

    // Check if user is already a participant
    const existingParticipant = call.participants.find(
      (p) => p.userId === session.user!.id
    );

    if (existingParticipant) {
      // User is rejoining - update leftAt to null if they had left
      if (existingParticipant.leftAt) {
        await prisma.callParticipant.update({
          where: { id: existingParticipant.id },
          data: { leftAt: null },
        });
      }

      const updatedCall = await prisma.call.findUnique({
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
        },
      });

      return NextResponse.json(updatedCall);
    }

    // Add new participant as callee
    await prisma.callParticipant.create({
      data: {
        callId: call.id,
        userId: session.user.id,
        role: "callee",
      },
    });

    const updatedCall = await prisma.call.findUnique({
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
      },
    });

    return NextResponse.json(updatedCall);
  } catch (error) {
    console.error("Error joining call:", error);
    return NextResponse.json({ error: "Failed to join call" }, { status: 500 });
  }
}
