import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { lookup } from 'dns/promises';
import * as https from 'https';
import * as net from 'net';
import * as tls from 'tls';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly endpoint: string;
  private readonly region: string;
  private readonly bucket: string;
  private readonly defaultSignedUrlExpiresIn: number;
  private readonly allowSelfSignedStorageCert: boolean;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly connectTimeoutMs: number;
  private readonly socketTimeoutMs: number;
  private readonly maxAttempts: number;

  constructor(private readonly prisma: PrismaService) {
    this.endpoint = this.normalizeEndpoint(process.env.MINIO_ENDPOINT ?? 'http://127.0.0.1:9000');
    this.region = process.env.MINIO_REGION ?? 'us-east-1';
    this.bucket = process.env.MINIO_BUCKET ?? 'helpdesk';
    this.defaultSignedUrlExpiresIn = this.parsePositiveInt(
      process.env.STORAGE_SIGNED_URL_EXPIRES_SECONDS,
      3600,
    );
    this.allowSelfSignedStorageCert = process.env.STORAGE_TLS_REJECT_UNAUTHORIZED === 'false';
    this.accessKeyId = process.env.MINIO_ACCESS_KEY ?? 'minioadmin';
    this.secretAccessKey = process.env.MINIO_SECRET_KEY ?? 'minioadmin';
    this.connectTimeoutMs = this.parsePositiveInt(process.env.STORAGE_CONNECT_TIMEOUT_MS, 5000);
    this.socketTimeoutMs = this.parsePositiveInt(process.env.STORAGE_SOCKET_TIMEOUT_MS, 10000);
    this.maxAttempts = this.parsePositiveInt(process.env.STORAGE_MAX_ATTEMPTS, 2);
    this.client = new S3Client({
      region: this.region,
      endpoint: this.endpoint,
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      },
      forcePathStyle: true,
      maxAttempts: this.maxAttempts,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      requestHandler: new NodeHttpHandler({
        connectionTimeout: this.connectTimeoutMs,
        socketTimeout: this.socketTimeoutMs,
        ...(this.allowSelfSignedStorageCert && this.endpoint.startsWith('https://')
          ? { httpsAgent: new https.Agent({ rejectUnauthorized: false }) }
          : {}),
      }),
    });
    this.logConfigurationWarnings();
    this.logBootstrapSummary();
  }

  private normalizeEndpoint(raw: string): string {
    const value = raw.trim().replace(/\/+$/, '');
    if (!value) return 'http://127.0.0.1:9000';
    if (/^https?:\/\//i.test(value)) return value;
    const useSsl = (process.env.MINIO_USE_SSL ?? '').trim().toLowerCase() === 'true';
    return `${useSsl ? 'https' : 'http'}://${value}`;
  }

  private parsePositiveInt(raw: string | undefined, fallback: number): number {
    const n = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  private endpointUrl() {
    return new URL(this.endpoint);
  }

  private isLoopbackHost(hostname: string): boolean {
    const value = hostname.trim().toLowerCase();
    return value === 'localhost' || value === '127.0.0.1' || value === '::1';
  }

  private logConfigurationWarnings() {
    const url = this.endpointUrl();
    const isProduction = (process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
    if (!isProduction) return;

    if (this.isLoopbackHost(url.hostname)) {
      this.logger.warn(
        `MINIO_ENDPOINT=${this.endpoint} apunta al propio contenedor. EasyPanel no alcanzará QuObjects externo con esa configuración.`,
      );
    }
    if (this.bucket === 'helpdesk') {
      this.logger.warn('Se está usando el bucket por defecto `helpdesk` en producción. Revise MINIO_BUCKET.');
    }
    if (this.accessKeyId === 'minioadmin' && this.secretAccessKey === 'minioadmin') {
      this.logger.warn('Se están usando credenciales MinIO por defecto en producción. Revise MINIO_ACCESS_KEY y MINIO_SECRET_KEY.');
    }
    if (url.protocol === 'https:' && net.isIP(url.hostname) && !this.allowSelfSignedStorageCert) {
      this.logger.warn(
        `MINIO_ENDPOINT=${this.endpoint} usa HTTPS sobre IP pública. Si el certificado no coincide con la IP, EasyPanel fallará al subir adjuntos hasta activar STORAGE_TLS_REJECT_UNAUTHORIZED=false o corregir el certificado.`,
      );
    }
  }

  private logBootstrapSummary() {
    this.logger.log(`Storage runtime ${JSON.stringify(this.getRuntimeInfo())}`);
  }

  getRuntimeInfo() {
    const url = this.endpointUrl();
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    return {
      endpoint: this.endpoint,
      protocol: url.protocol.replace(':', ''),
      hostname: url.hostname,
      port,
      bucket: this.bucket,
      region: this.region,
      tls_relaxed: this.allowSelfSignedStorageCert,
      hostname_kind: net.isIP(url.hostname) ? 'ip' : 'hostname',
      endpoint_looks_local: this.isLoopbackHost(url.hostname),
      using_default_bucket: this.bucket === 'helpdesk',
      using_default_credentials: this.accessKeyId === 'minioadmin' && this.secretAccessKey === 'minioadmin',
      connect_timeout_ms: this.connectTimeoutMs,
      socket_timeout_ms: this.socketTimeoutMs,
      max_attempts: this.maxAttempts,
    };
  }

  private async probeDns(hostname: string) {
    if (net.isIP(hostname)) {
      return { skipped: true, reason: 'ip-endpoint' as const };
    }
    try {
      const resolved = await lookup(hostname);
      return { ok: true, address: resolved.address, family: resolved.family };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async probeTcp(hostname: string, port: number, timeoutMs: number) {
    return new Promise<{ ok: boolean; error?: string; code?: string | null }>((resolve) => {
      const socket = net.createConnection({ host: hostname, port });
      let settled = false;
      const finish = (result: { ok: boolean; error?: string; code?: string | null }) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => finish({ ok: true }));
      socket.once('timeout', () => finish({ ok: false, error: `timeout after ${timeoutMs}ms` }));
      socket.once('error', (error: NodeJS.ErrnoException) =>
        finish({ ok: false, error: error.message, code: error.code ?? null }),
      );
    });
  }

  private async probeTls(hostname: string, port: number, timeoutMs: number) {
    return new Promise<{
      ok: boolean;
      authorized?: boolean;
      authorizationError?: string | null;
      protocol?: string | null;
      error?: string;
      code?: string | null;
      rejectUnauthorized: boolean;
    }>((resolve) => {
      const socket = tls.connect({
        host: hostname,
        port,
        servername: net.isIP(hostname) ? undefined : hostname,
        rejectUnauthorized: !this.allowSelfSignedStorageCert,
      });
      let settled = false;
      const finish = (result: {
        ok: boolean;
        authorized?: boolean;
        authorizationError?: string | null;
        protocol?: string | null;
        error?: string;
        code?: string | null;
        rejectUnauthorized: boolean;
      }) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(timeoutMs);
      socket.once('secureConnect', () =>
        finish({
          ok: true,
          authorized: socket.authorized,
          authorizationError:
            typeof socket.authorizationError === 'string'
              ? socket.authorizationError
              : socket.authorizationError?.message ?? null,
          protocol: socket.getProtocol() ?? null,
          rejectUnauthorized: !this.allowSelfSignedStorageCert,
        }),
      );
      socket.once('timeout', () =>
        finish({
          ok: false,
          error: `timeout after ${timeoutMs}ms`,
          rejectUnauthorized: !this.allowSelfSignedStorageCert,
        }),
      );
      socket.once('error', (error: NodeJS.ErrnoException) =>
        finish({
          ok: false,
          error: error.message,
          code: error.code ?? null,
          rejectUnauthorized: !this.allowSelfSignedStorageCert,
        }),
      );
    });
  }

  async probeConnection(timeoutMs = 5000) {
    const startedAt = Date.now();
    const info = this.getRuntimeInfo();
    const dns = await this.probeDns(info.hostname);
    const tcp = await this.probeTcp(info.hostname, info.port, timeoutMs);
    const tlsProbe =
      info.protocol === 'https' ? await this.probeTls(info.hostname, info.port, timeoutMs) : { skipped: true };
    let bucketHead:
      | { ok: true }
      | {
          ok: false;
          error_name: string;
          error_message: string;
          error_code: string | null;
          http_status: number | null;
        }
      | { skipped: true; reason: 'tcp-failed' | 'tls-failed' };
    if (!tcp.ok) {
      bucketHead = { skipped: true, reason: 'tcp-failed' };
    } else if (info.protocol === 'https' && !('skipped' in tlsProbe) && !tlsProbe.ok) {
      bucketHead = { skipped: true, reason: 'tls-failed' };
    } else {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
        bucketHead = { ok: true };
      } catch (error) {
        const e = error as {
          name?: string;
          message?: string;
          code?: string;
          Code?: string;
          $metadata?: { httpStatusCode?: number };
        };
        bucketHead = {
          ok: false,
          error_name: e?.name ?? 'Error',
          error_message: e?.message ?? String(error),
          error_code: e?.Code ?? e?.code ?? null,
          http_status: e?.$metadata?.httpStatusCode ?? null,
        };
      }
    }

    return {
      ...info,
      dns,
      tcp,
      tls: tlsProbe,
      bucket_head: bucketHead,
      duration_ms: Date.now() - startedAt,
    };
  }

  async putObject(key: string, body: Buffer, contentType: string) {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      const err = error as NodeJS.ErrnoException & {
        $metadata?: { attempts?: number; totalRetryDelay?: number; httpStatusCode?: number };
        address?: string;
        port?: number;
      };
      this.logger.error(
        `Storage putObject failed ${JSON.stringify({
          endpoint: this.endpoint,
          bucket: this.bucket,
          keyPrefix: key.slice(0, 80),
          errorName: err?.name ?? 'Error',
          errorMessage: err?.message ?? String(error),
          errorCode: err?.code ?? null,
          errorAddress: err?.address ?? null,
          errorPort: err?.port ?? null,
          attempts: err?.$metadata?.attempts ?? null,
          totalRetryDelay: err?.$metadata?.totalRetryDelay ?? null,
          httpStatusCode: err?.$metadata?.httpStatusCode ?? null,
        })}`,
      );
      throw error;
    }
  }

  async deleteObject(key: string) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
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
