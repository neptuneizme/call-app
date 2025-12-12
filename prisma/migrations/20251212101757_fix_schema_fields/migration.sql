/*
  Warnings:

  - You are about to drop the column `actionItems` on the `CallSummary` table. All the data in the column will be lost.
  - You are about to drop the column `keyPoints` on the `CallSummary` table. All the data in the column will be lost.
  - You are about to drop the column `tokensUsed` on the `CallSummary` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "mergedAudioPath" TEXT;

-- AlterTable
ALTER TABLE "CallSummary" DROP COLUMN "actionItems",
DROP COLUMN "keyPoints",
DROP COLUMN "tokensUsed",
ADD COLUMN     "durationSeconds" DOUBLE PRECISION,
ADD COLUMN     "language" TEXT,
ALTER COLUMN "summary" DROP NOT NULL,
ALTER COLUMN "modelUsed" SET DEFAULT 'deepgram-nova-3';
