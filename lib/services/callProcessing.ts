import prisma from "@/lib/db";
import { downloadFromS3 } from "@/lib/s3";
import {
  transcribeAudio,
  mergeTranscripts,
  formatMergedTranscript,
  generateSummary,
  TranscriptionResult,
} from "@/lib/openai";
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
    summary: string;
    keyPoints: string[];
    actionItems: string[];
  };
}

interface AudioUploadWithUser {
  id: string;
  filePath: string;
  userId: string;
  user: {
    id: string;
    name: string | null;
  };
}

// ============================================
// Main Processing Function
// ============================================

/**
 * Process a call: transcribe both audio files, merge, and generate summary
 * This is the main orchestration function for the AI pipeline
 */
export async function processCall(callId: string): Promise<ProcessingResult> {
  console.log(`[ProcessCall] Starting processing for call: ${callId}`);

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

    // Step 3: Transcribe each audio file
    const transcriptionResults = await transcribeAllAudioFiles(
      call.audioUploads
    );

    // Step 4: Merge transcripts
    const [transcript1, transcript2] = transcriptionResults;
    const speaker1Name = call.audioUploads[0].user.name || "Speaker 1";
    const speaker2Name = call.audioUploads[1].user.name || "Speaker 2";

    console.log(
      `[ProcessCall] Merging transcripts for ${speaker1Name} and ${speaker2Name}`
    );

    const mergedSegments = mergeTranscripts(
      transcript1.transcription,
      transcript2.transcription,
      speaker1Name,
      speaker2Name
    );

    const mergedTranscript = formatMergedTranscript(mergedSegments);

    console.log(
      `[ProcessCall] Merged transcript length: ${mergedTranscript.length} chars`
    );

    // Step 5: Generate summary with GPT-4
    console.log(`[ProcessCall] Generating summary with GPT-4...`);
    const summaryResult = await generateSummary(mergedTranscript);

    // Step 6: Save CallSummary to database
    const callSummary = await prisma.callSummary.create({
      data: {
        callId: call.id,
        mergedTranscript,
        summary: summaryResult.summary,
        keyPoints: summaryResult.keyPoints,
        actionItems: summaryResult.actionItems,
        modelUsed: "gpt-4o",
      },
    });

    // Step 7: Update call status to COMPLETED
    await prisma.call.update({
      where: { id: call.id },
      data: { status: CallStatus.COMPLETED },
    });

    console.log(`[ProcessCall] Processing complete for call: ${callId}`);

    return {
      success: true,
      callId,
      summary: {
        id: callSummary.id,
        summary: summaryResult.summary,
        keyPoints: summaryResult.keyPoints,
        actionItems: summaryResult.actionItems,
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
 * Transcribe all audio files and save transcriptions to database
 */
async function transcribeAllAudioFiles(
  audioUploads: AudioUploadWithUser[]
): Promise<Array<{ uploadId: string; transcription: TranscriptionResult }>> {
  const results: Array<{
    uploadId: string;
    transcription: TranscriptionResult;
  }> = [];

  for (const upload of audioUploads) {
    console.log(`[Transcribe] Processing audio: ${upload.filePath}`);
    console.log(
      `[Transcribe] Upload ID: ${upload.id}, User: ${
        upload.user.name || upload.userId
      }`
    );

    // Update status to PROCESSING
    await prisma.audioUpload.update({
      where: { id: upload.id },
      data: { status: TranscriptStatus.PROCESSING },
    });

    try {
      // Download audio from S3
      console.log(`[Transcribe] Downloading from S3: ${upload.filePath}`);
      const audioBuffer = await downloadFromS3(upload.filePath);
      console.log(
        `[Transcribe] Downloaded ${audioBuffer.length} bytes from S3`
      );

      // Validate audio buffer
      if (audioBuffer.length === 0) {
        throw new Error(
          `Empty audio file downloaded from S3: ${upload.filePath}`
        );
      }

      // Transcribe with Whisper
      console.log(`[Transcribe] Starting Whisper transcription...`);
      const transcription = await transcribeAudio(
        audioBuffer,
        `${upload.id}.webm`
      );
      console.log(
        `[Transcribe] Transcription complete: ${transcription.text.substring(
          0,
          100
        )}...`
      );

      // Save transcription to database
      await prisma.transcription.create({
        data: {
          audioUploadId: upload.id,
          textContent: transcription.text,
          rawResponse: JSON.parse(JSON.stringify(transcription)),
          wordTimestamps: JSON.parse(JSON.stringify(transcription.segments)),
          language: transcription.language,
          durationSeconds: transcription.duration,
        },
      });

      // Update upload status to COMPLETED
      await prisma.audioUpload.update({
        where: { id: upload.id },
        data: { status: TranscriptStatus.COMPLETED },
      });

      results.push({ uploadId: upload.id, transcription });
    } catch (error) {
      console.error(`[Transcribe] Error transcribing ${upload.id}:`, error);
      console.error(`[Transcribe] Error details:`, {
        uploadId: upload.id,
        filePath: upload.filePath,
        userId: upload.userId,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });

      // Update upload status to FAILED
      await prisma.audioUpload.update({
        where: { id: upload.id },
        data: { status: TranscriptStatus.FAILED },
      });

      throw error; // Re-throw to fail the whole process
    }
  }

  return results;
}

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
