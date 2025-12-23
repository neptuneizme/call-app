/*
  Warnings:

  - You are about to drop the `Transcription` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Transcription" DROP CONSTRAINT "Transcription_audioUploadId_fkey";

-- DropTable
DROP TABLE "Transcription";
