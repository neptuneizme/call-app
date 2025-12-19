import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ============================================
// Types & Schemas
// ============================================

export interface GeminiSegment {
  speaker: string; // Speaker name (e.g., "Caller", "Callee")
  channel: number; // Channel index (0 = left/caller, 1 = right/callee)
  start: number; // Start time in seconds
  end: number; // End time in seconds
  text: string;
}

export interface GeminiTranscriptionResult {
  transcript: string; // Full merged transcript with speaker labels
  segments: GeminiSegment[]; // Individual segments with timestamps
  duration: number; // Audio duration in seconds
  summary: string; // AI-generated summary
  keyPoints: string[]; // Key discussion points
  actionItems: string[]; // Action items mentioned
}

// Zod schema for structured output from Gemini
const transcriptionSchema = z.object({
  duration: z.number().describe("Total duration of the audio in seconds"),
  segments: z
    .array(
      z.object({
        speaker: z
          .string()
          .describe(
            "Speaker identifier: either the caller name for left channel (channel 0) or callee name for right channel (channel 1)"
          ),
        channel: z
          .number()
          .int()
          .min(0)
          .max(1)
          .describe("Audio channel: 0 for left (caller), 1 for right (callee)"),
        start: z.number().describe("Start time in seconds"),
        end: z.number().describe("End time in seconds"),
        text: z.string().describe("Transcribed text for this segment"),
      })
    )
    .describe("Chronologically ordered conversation segments"),
  summary: z
    .string()
    .describe(
      "A comprehensive 2-3 paragraph summary of the entire conversation in Vietnamese"
    ),
  keyPoints: z
    .array(z.string())
    .describe("3-7 key discussion points or topics covered (in Vietnamese)"),
  actionItems: z
    .array(z.string())
    .describe(
      "0-5 specific action items or follow-ups mentioned (in Vietnamese). Return empty array if none."
    ),
});

// ============================================
// Main Transcription Function
// ============================================

/**
 * Transcribe and summarize a stereo audio file using Gemini 2.5 Flash
 * Left channel (0) = Caller, Right channel (1) = Callee
 *
 * @param audioBuffer - Stereo WAV audio buffer
 * @param callerName - Name to use for left channel (caller)
 * @param calleeName - Name to use for right channel (callee)
 * @returns Transcription result with speaker-labeled segments and AI summary
 */
export async function transcribeAndSummarizeAudio(
  audioBuffer: Buffer,
  callerName: string = "Caller",
  calleeName: string = "Callee"
): Promise<GeminiTranscriptionResult> {
  console.log(
    `[Gemini] Starting audio transcription (${audioBuffer.length} bytes)`
  );
  console.log(
    `[Gemini] Speakers: ${callerName} (left/ch0), ${calleeName} (right/ch1)`
  );

  // Create temporary file for audio (Gemini API requires file path)
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(
    tempDir,
    `audio-${Date.now()}-${Math.random().toString(36).substring(7)}.wav`
  );

  try {
    // Write buffer to temporary file
    await fs.promises.writeFile(tempFilePath, audioBuffer);
    console.log(`[Gemini] Wrote temporary audio file: ${tempFilePath}`);

    const prompt = buildTranscriptionPrompt(callerName, calleeName);

    console.log(`[Gemini] Sending request to Gemini 2.5 Flash...`);
    const startTime = Date.now();

    // Use AI SDK's generateObject for structured output
    const { object } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: transcriptionSchema,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "file",
              data: audioBuffer,
              mediaType: "audio/wav",
            },
          ],
        },
      ],
    });

    const duration = Date.now() - startTime;
    console.log(`[Gemini] Transcription completed in ${duration}ms`);
    console.log(
      `[Gemini] Segments: ${object.segments.length}, Duration: ${object.duration}s`
    );

    // Sort segments chronologically
    const sortedSegments = object.segments.sort((a, b) => a.start - b.start);

    // Format transcript with speaker labels and timestamps
    const formattedTranscript = formatTranscript(sortedSegments);

    return {
      transcript: formattedTranscript,
      segments: sortedSegments,
      duration: object.duration,
      summary: object.summary,
      keyPoints: object.keyPoints,
      actionItems: object.actionItems,
    };
  } catch (error) {
    console.error("[Gemini] Transcription error:", error);
    throw new Error(
      `Gemini transcription failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  } finally {
    // Clean up temporary file
    try {
      await fs.promises.unlink(tempFilePath);
      console.log(`[Gemini] Cleaned up temporary file: ${tempFilePath}`);
    } catch (err) {
      console.warn(`[Gemini] Failed to delete temporary file:`, err);
    }
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Build the transcription prompt for Gemini
 */
function buildTranscriptionPrompt(
  callerName: string,
  calleeName: string
): string {
  return `Bạn là một AI chuyên về phiên âm và tóm tắt cuộc gọi video. Hãy phân tích file âm thanh stereo này và thực hiện các nhiệm vụ sau:

**THÔNG TIN QUAN TRỌNG:**
- File âm thanh là stereo (2 kênh)
- Kênh trái (channel 0) = ${callerName} (người gọi)
- Kênh phải (channel 1) = ${calleeName} (người nhận)
- Ngôn ngữ: Tiếng Việt

**NHIỆM VỤ:**

1. **Phiên âm chính xác**: 
   - Phiên âm toàn bộ cuộc hội thoại từ cả hai kênh
   - Xác định chính xác người nói dựa trên kênh âm thanh
   - Ghi lại thời gian bắt đầu và kết thúc cho mỗi đoạn hội thoại
   - Sắp xếp các đoạn theo thứ tự thời gian
   - Sử dụng dấu câu và định dạng phù hợp

2. **Tóm tắt cuộc gọi**:
   - Viết tóm tắt 2-3 đoạn văn về nội dung cuộc gọi
   - Tập trung vào những điểm chính được thảo luận
   - Ghi nhận các quyết định hoặc thỏa thuận

3. **Điểm chính** (Key Points):
   - Liệt kê 3-7 chủ đề hoặc điểm quan trọng
   - Mỗi điểm nên ngắn gọn và rõ ràng

4. **Hành động cần thực hiện** (Action Items):
   - Liệt kê 0-5 hành động cụ thể được đề cập
   - Chỉ bao gồm những việc rõ ràng cần làm
   - Nếu không có, trả về mảng rỗng

Hãy trả về kết quả theo định dạng JSON được yêu cầu.`;
}

/**
 * Format segments into a readable transcript string
 */
function formatTranscript(segments: GeminiSegment[]): string {
  let lastSpeaker = "";
  const formattedLines: string[] = [];

  for (const segment of segments) {
    const timestamp = formatTimestamp(segment.start);

    // Add speaker header if speaker changes
    if (segment.speaker !== lastSpeaker) {
      if (lastSpeaker !== "") {
        formattedLines.push(""); // Empty line between speaker changes
      }
      formattedLines.push(`[${timestamp}] ${segment.speaker}:`);
      lastSpeaker = segment.speaker;
    }

    formattedLines.push(segment.text);
  }

  return formattedLines.join("\n");
}

/**
 * Format seconds into MM:SS or HH:MM:SS
 */
function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

/**
 * Estimate audio duration from buffer size (rough estimate)
 * Assumes 16kHz, 16-bit, stereo WAV format
 */
export function estimateAudioDuration(bufferSize: number): number {
  // WAV format: 16kHz * 2 bytes (16-bit) * 2 channels = 64000 bytes/second
  const bytesPerSecond = 16000 * 2 * 2;
  return bufferSize / bytesPerSecond;
}
