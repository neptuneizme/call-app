import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { CallStatus } from "@prisma/client";

// POST /api/calls - Create a new call
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { callId } = body;

    // Validate required fields
    if (!callId) {
      return NextResponse.json(
        { error: "callId is required" },
        { status: 400 }
      );
    }

    // Check if call already exists
    const existingCall = await prisma.call.findUnique({
      where: { callId },
    });

    if (existingCall) {
      return NextResponse.json(
        { error: "Call already exists" },
        { status: 409 }
      );
    }

    // Create the call with the current user as first participant
    const call = await prisma.call.create({
      data: {
        callId,
        status: "IN_PROGRESS",
        participants: {
          create: {
            userId: session.user.id,
            role: "caller",
          },
        },
      },
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

    return NextResponse.json(call, { status: 201 });
  } catch (error) {
    console.error("Error creating call:", error);
    return NextResponse.json(
      { error: "Failed to create call" },
      { status: 500 }
    );
  }
}

// GET /api/calls - Get all calls for the current user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

    const calls = await prisma.call.findMany({
      where: {
        participants: {
          some: {
            userId: session.user.id,
          },
        },
        ...(status && { status: status as CallStatus }),
      },
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
      orderBy: {
        startedAt: "desc",
      },
      take: limit,
      skip: offset,
    });

    return NextResponse.json(calls);
  } catch (error) {
    console.error("Error fetching calls:", error);
    return NextResponse.json(
      { error: "Failed to fetch calls" },
      { status: 500 }
    );
  }
}
