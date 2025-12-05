import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Initialize S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!;

/**
 * Generate a presigned URL for uploading a file directly to S3
 * This allows client-side uploads without exposing AWS credentials
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600 // 1 hour default
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Generate a presigned URL for downloading/viewing a file from S3
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn: number = 3600 // 1 hour default
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Upload a file buffer directly to S3 (server-side upload)
 */
export async function uploadToS3(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<{ key: string; url: string }> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await s3Client.send(command);

  return {
    key,
    url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
  };
}

/**
 * Delete a file from S3
 */
export async function deleteFromS3(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}

/**
 * Download a file from S3 as a Buffer (server-side)
 */
export async function downloadFromS3(key: string): Promise<Buffer> {
  console.log(`[S3] Downloading file: ${key}`);

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  try {
    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new Error(
        `Failed to download file from S3: ${key} - No body in response`
      );
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    console.log(`[S3] Downloaded ${buffer.length} bytes for key: ${key}`);

    return buffer;
  } catch (error) {
    console.error(`[S3] Error downloading file ${key}:`, error);
    throw new Error(
      `Failed to download from S3: ${key} - ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Generate a unique S3 key for audio uploads
 * Format: audio/{callId}/{oderId}/{timestamp}-{random}.webm
 */
export function generateAudioKey(
  callId: string,
  userId: string,
  fileExtension: string = "webm"
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `audio/${callId}/${userId}/${timestamp}-${random}.${fileExtension}`;
}

export { s3Client, BUCKET_NAME };
