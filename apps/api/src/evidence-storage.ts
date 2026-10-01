import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { resolve } from 'path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export const evidenceDirectory = resolve(
  process.env.EVIDENCE_DIRECTORY ??
    resolve(__dirname, '../../../.storage/evidence'),
);

@Injectable()
export class EvidenceStorage implements OnModuleDestroy {
  private readonly remote = process.env.EVIDENCE_STORAGE === 's3';
  private readonly bucket = process.env.EVIDENCE_S3_BUCKET;
  private readonly client = this.remote
    ? new S3Client({
        endpoint: process.env.AWS_ENDPOINT_URL_S3,
        region: process.env.AWS_REGION,
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      })
    : undefined;

  async put(key: string, bytes: Buffer): Promise<string> {
    if (this.client) {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: bytes,
          ContentType: 'image/jpeg',
          CacheControl: 'no-store',
        }),
      );
      return `s3:${key}`;
    }
    await mkdir(evidenceDirectory, { recursive: true });
    await writeFile(resolve(evidenceDirectory, key), bytes, { flag: 'wx' });
    return key;
  }

  async get(key: string): Promise<Buffer> {
    if (key.startsWith('s3:')) {
      if (!this.client) throw new Error('Remote evidence storage unavailable');
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key.slice(3) }),
      );
      if (!result.Body || (result.ContentLength ?? 0) > 5 * 1024 * 1024)
        throw new Error('Invalid evidence object');
      return Buffer.from(await result.Body.transformToByteArray());
    }
    return readFile(resolve(evidenceDirectory, key));
  }

  async remove(key: string) {
    if (key.startsWith('s3:')) {
      if (!this.client) throw new Error('Remote evidence storage unavailable');
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key.slice(3) }),
      );
      return;
    }
    await unlink(resolve(evidenceDirectory, key));
  }

  onModuleDestroy() {
    this.client?.destroy();
  }
}
