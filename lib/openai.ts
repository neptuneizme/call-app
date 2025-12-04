import OpenAI from "openai";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================
// Types
// ============================================

export interface TranscriptSegment {
  start: number; // Start time in seconds
  end: number; // End time in seconds
  text: string;
}

export interface TranscriptionResult {
  text: string; // Full transcript text
  segments: TranscriptSegment[]; // Segments with timestamps
  language: string; // Detected language
  duration: number; // Audio duration in seconds
}

export interface SummaryResult {
  summary: string; // Main summary paragraph
  keyPoints: string[]; // Bullet points of key topics
  actionItems: string[]; // Action items mentioned
}

export interface MergedSegment {
  speaker: string; // "Speaker 1" or "Speaker 2" (or participant name)
  start: number;
  end: number;
  text: string;
}

// ============================================
// Transcription (Whisper)
// ============================================

/**
 * Transcribe an audio file using OpenAI Whisper
 * Returns full text and timestamped segments
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string = "audio.webm"
): Promise<TranscriptionResult> {
  // Convert Buffer to Uint8Array for File constructor compatibility
  const uint8Array = new Uint8Array(audioBuffer);
  const file = new File([uint8Array], filename, { type: "audio/webm" });

  // Call Whisper API with verbose_json for timestamps
  const response = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });

  // Extract segments from response
  const segments: TranscriptSegment[] = (response.segments || []).map(
    (seg) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text.trim(),
    })
  );

  return {
    text: response.text,
    segments,
    language: response.language || "en",
    duration: response.duration || 0,
  };
}

// ============================================
// Transcript Merging
// ============================================

/**
 * Merge two transcripts into a single chronological conversation
 * Uses segment timestamps to interleave speakers
 */
export function mergeTranscripts(
  transcript1: TranscriptionResult,
  transcript2: TranscriptionResult,
  speaker1Name: string = "Speaker 1",
  speaker2Name: string = "Speaker 2"
): MergedSegment[] {
  // Create merged segments with speaker labels
  const allSegments: MergedSegment[] = [
    ...transcript1.segments.map((seg) => ({
      speaker: speaker1Name,
      start: seg.start,
      end: seg.end,
      text: seg.text,
    })),
    ...transcript2.segments.map((seg) => ({
      speaker: speaker2Name,
      start: seg.start,
      end: seg.end,
      text: seg.text,
    })),
  ];

  // Sort by start time
  allSegments.sort((a, b) => a.start - b.start);

  // Merge consecutive segments from the same speaker
  const mergedSegments: MergedSegment[] = [];
  for (const segment of allSegments) {
    const lastSegment = mergedSegments[mergedSegments.length - 1];

    // If same speaker and close in time (within 2 seconds), merge
    if (
      lastSegment &&
      lastSegment.speaker === segment.speaker &&
      segment.start - lastSegment.end < 2
    ) {
      lastSegment.end = segment.end;
      lastSegment.text += " " + segment.text;
    } else {
      mergedSegments.push({ ...segment });
    }
  }

  return mergedSegments;
}

/**
 * Format merged segments into a readable transcript string
 */
export function formatMergedTranscript(segments: MergedSegment[]): string {
  return segments
    .map((seg) => {
      const timestamp = formatTimestamp(seg.start);
      return `[${timestamp}] ${seg.speaker}: ${seg.text}`;
    })
    .join("\n\n");
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

// ============================================
// Summary Generation (GPT-4)
// ============================================

/**
 * Generate a summary of a call transcript using GPT-4
 */
export async function generateSummary(
  mergedTranscript: string
): Promise<SummaryResult> {
  const systemPrompt = `You are an AI assistant that summarizes video call transcripts. 
Analyze the conversation and provide:
1. A concise summary (2-3 paragraphs) of what was discussed
2. Key points as bullet points (3-7 items)
3. Any action items or follow-ups mentioned (0-5 items)

Format your response as JSON with the following structure:
{
  "summary": "...",
  "keyPoints": ["...", "..."],
  "actionItems": ["...", "..."]
}

If there are no action items, return an empty array.
Be concise but comprehensive. Focus on the main topics and decisions made.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Please summarize this call transcript:\n\n${mergedTranscript}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3, // Lower temperature for more consistent summaries
  });

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error("No response from GPT-4");
  }

  // Parse JSON response
  const result = JSON.parse(content) as SummaryResult;

  // Ensure arrays exist
  return {
    summary: result.summary || "No summary available.",
    keyPoints: result.keyPoints || [],
    actionItems: result.actionItems || [],
  };
}

// ============================================
// Token/Cost Estimation (Optional)
// ============================================

/**
 * Estimate the number of tokens in a text (rough estimate)
 * GPT models use ~4 characters per token on average
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export { openai };
