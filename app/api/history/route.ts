import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth";
import type { CallStatus, Prisma } from "@prisma/client";

// GET /api/history - Fetch user's call history
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");
    const status = searchParams.get("status") as CallStatus | null;

    // Build where clause
    const whereClause: Prisma.CallWhereInput = {
      participants: {
        some: {
          userId: session.user.id,
        },
      },
      ...(status && { status }),
    };

    // Get total count
    const total = await prisma.call.count({
      where: whereClause,
    });

    // Get calls with related data
    const calls = await prisma.call.findMany({
      where: whereClause,
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
          orderBy: {
            joinedAt: "asc",
          },
        },
        audioUploads: {
          select: {
            id: true,
            userId: true,
            status: true,
            uploadedAt: true,
            fileSize: true,
            durationSeconds: true,
          },
        },
        summary: {
          select: {
            id: true,
            summary: true,
            mergedTranscript: true,
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

    // Transform data for frontend
    const transformedCalls = calls.map((call) => {
      // Calculate duration in seconds
      const duration = call.endedAt
        ? Math.floor((call.endedAt.getTime() - call.startedAt.getTime()) / 1000)
        : null;

      return {
        id: call.id,
        callId: call.callId,
        status: call.status,
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        duration,
        participants: call.participants.map((p) => ({
          id: p.user.id,
          name: p.user.name,
          email: p.user.email,
          image: p.user.image,
          role: p.role,
          joinedAt: p.joinedAt,
          leftAt: p.leftAt,
        })),
        audioUploads: call.audioUploads.map((upload) => ({
          id: upload.id,
          oderId: upload.userId,
          status: upload.status,
          uploadedAt: upload.uploadedAt,
          fileSize: upload.fileSize,
          durationSeconds: upload.durationSeconds,
        })),
        summary: call.summary
          ? {
              id: call.summary.id,
              preview: call.summary.summary
                ? call.summary.summary.substring(0, 200) +
                  (call.summary.summary.length > 200 ? "..." : "")
                : "Bản ghi đã sẵn sàng",
              transcript: call.summary.mergedTranscript,
              generatedAt: call.summary.generatedAt,
            }
          : null,
      };
    });

    return NextResponse.json({
      calls: transformedCalls,
      total,
      limit,
      offset,
      hasMore: offset + calls.length < total,
    });
  } catch (error) {
    console.error("Error fetching history:", error);
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 }
    );
  }
}
