import { Injectable, NotFoundException } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import * as https from 'https';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly defaultSignedUrlExpiresIn: number;

  constructor(private readonly prisma: PrismaService) {
    const endpoint = this.normalizeEndpoint(process.env.MINIO_ENDPOINT ?? 'http://127.0.0.1:9000');
    const region = process.env.MINIO_REGION ?? 'us-east-1';
    this.bucket = process.env.MINIO_BUCKET ?? 'helpdesk';
    this.defaultSignedUrlExpiresIn = this.parsePositiveInt(
      process.env.STORAGE_SIGNED_URL_EXPIRES_SECONDS,
      3600,
    );
    const allowSelfSignedStorageCert = process.env.STORAGE_TLS_REJECT_UNAUTHORIZED === 'false';
    this.client = new S3Client({
      region,
      endpoint,
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
        secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
      },
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      ...(allowSelfSignedStorageCert && endpoint.startsWith('https://')
        ? { requestHandler: new NodeHttpHandler({ httpsAgent: new https.Agent({ rejectUnauthorized: false }) }) }
        : {}),
    });
  }

  private normalizeEndpoint(raw: string): string {
    const value = raw.trim().replace(/\/+$/, '');
    if (!value) return 'http://127.0.0.1:9000';
    if (/^https?:\/\//i.test(value)) return value;
    return `http://${value}`;
  }

  private parsePositiveInt(raw: string | undefined, fallback: number): number {
    const n = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
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

  async getSignedGetUrl(key: string, expiresIn = this.defaultSignedUrlExpiresIn) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }

  async getObject(key: string) {
    return this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
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
