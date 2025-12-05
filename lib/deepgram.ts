import { createClient, DeepgramClient } from "@deepgram/sdk";

// Initialize Deepgram client
const deepgramClient: DeepgramClient = createClient(
  process.env.DEEPGRAM_API_KEY || ""
);

// ============================================
// Types
// ============================================

export interface DeepgramSegment {
  speaker: string; // Speaker name (mapped from channel)
  channel: number; // Channel index (0 = caller, 1 = callee)
  start: number; // Start time in seconds
  end: number; // End time in seconds
  text: string;
}

export interface DeepgramTranscriptionResult {
  transcript: string; // Full merged transcript with speaker labels
  segments: DeepgramSegment[]; // Individual segments with timestamps
  summary: string; // Deepgram's generated summary
  duration: number; // Audio duration in seconds
  language: string; // Detected language
}

// ============================================
// Multichannel Transcription with Summarization
// ============================================

/**
 * Transcribe a stereo audio file using Deepgram's multichannel feature
 * Channel 0 (left) = Caller, Channel 1 (right) = Callee
 *
 * @param audioBuffer - Stereo WAV audio buffer
 * @param callerName - Name to use for channel 0 (caller)
 * @param calleeName - Name to use for channel 1 (callee)
 * @returns Transcription result with speaker-labeled segments and summary
 */
export async function transcribeMultichannel(
  audioBuffer: Buffer,
  callerName: string = "Caller",
  calleeName: string = "Callee"
): Promise<DeepgramTranscriptionResult> {
  console.log(
    `[Deepgram] Starting multichannel transcription (${audioBuffer.length} bytes)`
  );
  console.log(`[Deepgram] Speakers: ${callerName} (ch0), ${calleeName} (ch1)`);

  const { result, error } =
    await deepgramClient.listen.prerecorded.transcribeFile(audioBuffer, {
      model: "nova-2",
      smart_format: true,
      punctuate: true,
      paragraphs: true,
      utterances: true,
      multichannel: true,
      channels: 2,
      summarize: "v2", // Enable Deepgram summarization
      detect_language: true,
    });

  if (error) {
    console.error("[Deepgram] Transcription error:", error);
    throw new Error(`Deepgram transcription failed: ${error.message}`);
  }

  if (!result?.results?.channels) {
    throw new Error("No transcription results from Deepgram");
  }

  // Map channel index to speaker name
  const speakerNames: Record<number, string> = {
    0: callerName,
    1: calleeName,
  };

  // Extract segments from each channel
  const segments: DeepgramSegment[] = [];

  result.results.channels.forEach((channel, channelIndex) => {
    const speakerName = speakerNames[channelIndex] || `Speaker ${channelIndex}`;

    // Use utterances if available, otherwise use words
    const alternatives = channel.alternatives?.[0];
    if (!alternatives) return;

    // Process paragraphs or create segments from words
    if (alternatives.paragraphs?.paragraphs) {
      for (const paragraph of alternatives.paragraphs.paragraphs) {
        for (const sentence of paragraph.sentences || []) {
          segments.push({
            speaker: speakerName,
            channel: channelIndex,
            start: sentence.start,
            end: sentence.end,
            text: sentence.text.trim(),
          });
        }
      }
    } else if (alternatives.words) {
      // Fallback: group words into segments
      let currentSegment: DeepgramSegment | null = null;
      const GAP_THRESHOLD = 1.0; // 1 second gap to split segments

      for (const word of alternatives.words) {
        if (
          !currentSegment ||
          word.start - currentSegment.end > GAP_THRESHOLD
        ) {
          if (currentSegment) {
            segments.push(currentSegment);
          }
          currentSegment = {
            speaker: speakerName,
            channel: channelIndex,
            start: word.start,
            end: word.end,
            text: word.word || word.punctuated_word || "",
          };
        } else {
          currentSegment.end = word.end;
          currentSegment.text +=
            " " + (word.punctuated_word || word.word || "");
        }
      }
      if (currentSegment) {
        segments.push(currentSegment);
      }
    }
  });

  // Sort segments by start time for chronological order
  segments.sort((a, b) => a.start - b.start);

  // Build formatted transcript with speaker labels
  const transcript = segments
    .map((seg) => {
      const timestamp = formatTimestamp(seg.start);
      return `[${timestamp}] ${seg.speaker}: ${seg.text}`;
    })
    .join("\n\n");

  // Extract summary from Deepgram response
  const summary =
    result.results.summary?.short ||
    result.results.summary?.result ||
    "No summary available.";

  // Get metadata
  const duration = result.metadata?.duration || 0;
  const language =
    result.results.channels[0]?.detected_language ||
    result.results.channels[0]?.alternatives?.[0]?.languages?.[0] ||
    "en";

  console.log(`[Deepgram] Transcription complete:`);
  console.log(`  - Duration: ${duration}s`);
  console.log(`  - Language: ${language}`);
  console.log(`  - Segments: ${segments.length}`);
  console.log(`  - Summary length: ${summary.length} chars`);

  return {
    transcript,
    segments,
    summary,
    duration,
    language,
  };
}

/**
 * Format seconds into MM:SS or HH:MM:SS
 */
function formatTimestamp(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export { deepgramClient };
