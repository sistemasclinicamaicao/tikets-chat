import { Injectable, NotFoundException } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly prisma: PrismaService) {
    const endpoint = process.env.MINIO_ENDPOINT ?? 'http://127.0.0.1:9000';
    const region = process.env.MINIO_REGION ?? 'us-east-1';
    this.bucket = process.env.MINIO_BUCKET ?? 'helpdesk';
    this.client = new S3Client({
      region,
      endpoint,
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
        secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
      },
      forcePathStyle: true,
    });
  }

  async putObject(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async getSignedGetUrl(key: string, expiresIn = 3600) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }

  /** Pre-signed URL for a ticket `Attachment` row (table `attachments`). */
  async getAttachmentUrl(attachmentId: string, expiresIn = 3600): Promise<string> {
    const row = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { storageKey: true },
    });
    if (!row) {
      throw new NotFoundException('Attachment not found');
    }
    return this.getSignedGetUrl(row.storageKey, expiresIn);
  }
}
