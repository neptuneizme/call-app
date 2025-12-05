import prisma from "@/lib/db";
import {
  downloadFromS3,
  uploadToS3,
  deleteFromS3,
  generateMergedAudioKey,
} from "@/lib/s3";
import { transcribeMultichannel } from "@/lib/deepgram";
import { mergeToStereo } from "@/lib/audio";
import { CallStatus, TranscriptStatus } from "@prisma/client";

// ============================================
// Types
// ============================================

export interface ProcessingResult {
  success: boolean;
  callId: string;
  error?: string;
  summary?: {
    id: string;
    transcript: string;
  };
}

// ============================================
// Main Processing Function
// ============================================

/**
 * Process a call: merge audio files, transcribe with Deepgram multichannel
 * Uses Deepgram's Nova-3 model with multichannel support for Vietnamese transcription
 */
export async function processCall(callId: string): Promise<ProcessingResult> {
  console.log(`[ProcessCall] ========================================`);
  console.log(`[ProcessCall] Starting processing for call: ${callId}`);
  console.log(`[ProcessCall] Timestamp: ${new Date().toISOString()}`);

  try {
    // Step 1: Get call with audio uploads
    const call = await prisma.call.findUnique({
      where: { callId },
      include: {
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
      },
    });

    if (!call) {
      throw new Error(`Call not found: ${callId}`);
    }

    // Step 2: Validate call state
    if (
      call.status !== CallStatus.PROCESSING &&
      call.status !== CallStatus.AWAITING_UPLOADS
    ) {
      throw new Error(`Invalid call status for processing: ${call.status}`);
    }

    if (call.audioUploads.length < 2) {
      throw new Error(
        `Not enough audio uploads. Found: ${call.audioUploads.length}, need: 2`
      );
    }

    // Update status to PROCESSING
    await prisma.call.update({
      where: { id: call.id },
      data: { status: CallStatus.PROCESSING },
    });

    console.log(
      `[ProcessCall] Found ${call.audioUploads.length} audio uploads`
    );

    // Log details of each upload for debugging
    call.audioUploads.forEach((upload, index) => {
      console.log(`[ProcessCall] Upload ${index + 1}:`, {
        id: upload.id,
        userId: upload.userId,
        userName: upload.user.name,
        filePath: upload.filePath,
      });
    });

    // Step 3: Download both audio files
    console.log(`[ProcessCall] Downloading audio files from S3...`);

    // Find caller and callee uploads based on participant role
    const callerParticipant = call.participants.find(
      (p) => p.role === "caller"
    );
    const calleeParticipant = call.participants.find(
      (p) => p.role === "callee"
    );

    if (!callerParticipant || !calleeParticipant) {
      throw new Error("Could not identify caller and callee participants");
    }

    const callerUpload = call.audioUploads.find(
      (u) => u.userId === callerParticipant.userId
    );
    const calleeUpload = call.audioUploads.find(
      (u) => u.userId === calleeParticipant.userId
    );

    if (!callerUpload || !calleeUpload) {
      throw new Error("Could not find audio uploads for both participants");
    }

    // Update both uploads to PROCESSING
    await prisma.audioUpload.updateMany({
      where: { id: { in: [callerUpload.id, calleeUpload.id] } },
      data: { status: TranscriptStatus.PROCESSING },
    });

    const [callerAudio, calleeAudio] = await Promise.all([
      downloadFromS3(callerUpload.filePath),
      downloadFromS3(calleeUpload.filePath),
    ]);

    console.log(
      `[ProcessCall] Downloaded caller audio: ${callerAudio.length} bytes`
    );
    console.log(
      `[ProcessCall] Downloaded callee audio: ${calleeAudio.length} bytes`
    );

    // Step 4: Merge audio files into stereo (caller=left, callee=right)
    console.log(`[ProcessCall] Merging audio files into stereo...`);
    const mergedAudio = await mergeToStereo(callerAudio, calleeAudio);
    console.log(`[ProcessCall] Merged audio size: ${mergedAudio.length} bytes`);

    // Step 5: Upload merged audio to S3
    const mergedAudioKey = generateMergedAudioKey(callId);
    console.log(
      `[ProcessCall] Uploading merged audio to S3: ${mergedAudioKey}`
    );
    await uploadToS3(mergedAudioKey, mergedAudio, "audio/wav");

    // Step 6: Transcribe with Deepgram multichannel + summarization
    const callerName =
      call.audioUploads.find((u) => u.userId === callerParticipant.userId)?.user
        .name || "Caller";
    const calleeName =
      call.audioUploads.find((u) => u.userId === calleeParticipant.userId)?.user
        .name || "Callee";

    console.log(
      `[ProcessCall] Transcribing with Deepgram (${callerName} vs ${calleeName})...`
    );
    const transcriptionResult = await transcribeMultichannel(
      mergedAudio,
      callerName,
      calleeName
    );

    console.log(
      `[ProcessCall] Transcription complete. Duration: ${transcriptionResult.duration}s`
    );

    // Step 7: Save CallSummary to database (summary will be generated later with GPT)
    const callSummary = await prisma.callSummary.create({
      data: {
        callId: call.id,
        mergedTranscript: transcriptionResult.transcript,
        summary: null, // Will be filled later by GPT-5-mini
        language: "vi",
        durationSeconds: transcriptionResult.duration,
        modelUsed: "deepgram-nova-3",
      },
    });

    // Step 8: Update call with merged audio path
    await prisma.call.update({
      where: { id: call.id },
      data: {
        status: CallStatus.COMPLETED,
        mergedAudioPath: mergedAudioKey,
      },
    });

    // Step 9: Update both uploads to COMPLETED
    await prisma.audioUpload.updateMany({
      where: { id: { in: [callerUpload.id, calleeUpload.id] } },
      data: { status: TranscriptStatus.COMPLETED },
    });

    // Step 10: Delete individual audio files from S3
    console.log(`[ProcessCall] Cleaning up individual audio files...`);
    await Promise.all([
      deleteFromS3(callerUpload.filePath).catch((err) =>
        console.warn(`[ProcessCall] Failed to delete caller audio:`, err)
      ),
      deleteFromS3(calleeUpload.filePath).catch((err) =>
        console.warn(`[ProcessCall] Failed to delete callee audio:`, err)
      ),
    ]);

    console.log(`[ProcessCall] Processing complete for call: ${callId}`);

    return {
      success: true,
      callId,
      summary: {
        id: callSummary.id,
        transcript: transcriptionResult.transcript,
      },
    };
  } catch (error) {
    console.error(`[ProcessCall] Error processing call ${callId}:`, error);

    // Update call status to FAILED
    try {
      await prisma.call.update({
        where: { callId },
        data: { status: CallStatus.FAILED },
      });
    } catch (updateError) {
      console.error(
        `[ProcessCall] Failed to update call status to FAILED:`,
        updateError
      );
    }

    return {
      success: false,
      callId,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Check if a call is ready for processing (both uploads complete)
 */
export async function isCallReadyForProcessing(
  callId: string
): Promise<boolean> {
  const call = await prisma.call.findUnique({
    where: { callId },
    include: {
      audioUploads: true,
      participants: true,
    },
  });

  if (!call) return false;

  // Check if we have uploads from all participants
  const uploadUserIds = new Set(call.audioUploads.map((u) => u.userId));
  const participantUserIds = new Set(call.participants.map((p) => p.userId));

  // All participants must have uploaded
  for (const participantId of participantUserIds) {
    if (!uploadUserIds.has(participantId)) {
      return false;
    }
  }

  return true;
}

/**
 * Get processing status for a call
 */
export async function getProcessingStatus(callId: string): Promise<{
  status: CallStatus;
  uploadsComplete: number;
  uploadsTotal: number;
  hasSummary: boolean;
}> {
  const call = await prisma.call.findUnique({
    where: { callId },
    include: {
      audioUploads: true,
      participants: true,
      summary: true,
    },
  });

  if (!call) {
    throw new Error(`Call not found: ${callId}`);
  }

  return {
    status: call.status,
    uploadsComplete: call.audioUploads.length,
    uploadsTotal: call.participants.length,
    hasSummary: !!call.summary,
  };
}
