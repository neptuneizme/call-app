import ffmpeg from "fluent-ffmpeg";
import { writeFile, unlink, mkdtemp, rmdir, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";

// Try to find ffmpeg path - use system ffmpeg or homebrew ffmpeg
function findFfmpegPath(): string {
  // Common locations to check
  const locations = [
    "/usr/local/bin/ffmpeg", // Homebrew Intel Mac
    "/opt/homebrew/bin/ffmpeg", // Homebrew Apple Silicon
    "/usr/bin/ffmpeg", // Linux/System
  ];

  for (const loc of locations) {
    try {
      execSync(`test -f ${loc}`);
      return loc;
    } catch {
      // Continue to next location
    }
  }

  // Try to find it via which command
  try {
    const path = execSync("which ffmpeg").toString().trim();
    if (path) return path;
  } catch {
    // Fall through
  }

  throw new Error(
    "FFmpeg not found. Please install ffmpeg: brew install ffmpeg"
  );
}

// Set ffmpeg path
try {
  const ffmpegPath = findFfmpegPath();
  ffmpeg.setFfmpegPath(ffmpegPath);
  console.log(`[Audio] Using ffmpeg at: ${ffmpegPath}`);
} catch (error) {
  console.warn("[Audio] FFmpeg not found, audio merging will fail:", error);
}

/**
 * Merge two audio buffers into a stereo file
 * Caller audio goes to left channel, Callee audio goes to right channel
 *
 * @param callerAudio - Audio buffer from the caller
 * @param calleeAudio - Audio buffer from the callee
 * @returns Promise<Buffer> - Merged stereo audio as WAV buffer
 */
export async function mergeToStereo(
  callerAudio: Buffer,
  calleeAudio: Buffer
): Promise<Buffer> {
  // Create a temporary directory for processing
  const tempDir = await mkdtemp(join(tmpdir(), "audio-merge-"));
  const callerPath = join(tempDir, "caller.webm");
  const calleePath = join(tempDir, "callee.webm");
  const outputPath = join(tempDir, "merged.wav");

  try {
    // Write input buffers to temp files
    await writeFile(callerPath, callerAudio);
    await writeFile(calleePath, calleeAudio);

    // Merge using ffmpeg
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(callerPath)
        .input(calleePath)
        .complexFilter([
          // Convert both inputs to mono and combine as stereo
          // Caller = left channel (channel 0)
          // Callee = right channel (channel 1)
          "[0:a]aformat=channel_layouts=mono[left]",
          "[1:a]aformat=channel_layouts=mono[right]",
          "[left][right]amerge=inputs=2[stereo]",
        ])
        .outputOptions([
          "-map",
          "[stereo]",
          "-ac",
          "2", // 2 channels (stereo)
          "-ar",
          "16000", // 16kHz sample rate (good for speech)
          "-acodec",
          "pcm_s16le", // WAV format
        ])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });

    // Read the merged file
    const mergedBuffer = await readFile(outputPath);

    return mergedBuffer;
  } finally {
    // Clean up temp files
    try {
      await unlink(callerPath).catch(() => {});
      await unlink(calleePath).catch(() => {});
      await unlink(outputPath).catch(() => {});
      await rmdir(tempDir).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
  }
}
