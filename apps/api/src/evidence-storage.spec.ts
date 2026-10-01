import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { EvidenceStorage } from './evidence-storage';

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return { ...actual, S3Client: jest.fn() };
});

describe('private remote evidence storage', () => {
  const saved = { ...process.env };
  const send = jest.fn();
  const destroy = jest.fn();
  beforeEach(() => {
    process.env.EVIDENCE_STORAGE = 's3';
    process.env.EVIDENCE_S3_BUCKET = 'private-evidence';
    send.mockReset();
    (S3Client as unknown as jest.Mock).mockImplementation(() => ({
      send,
      destroy,
    }));
  });
  afterAll(() => {
    process.env = saved;
  });
  it('writes re-encoded images privately and returns a provider-marked key', async () => {
    send.mockResolvedValue({});
    const storage = new EvidenceStorage();
    const bytes = Buffer.from('processed image');
    await expect(storage.put('random.jpg', bytes)).resolves.toBe(
      's3:random.jpg',
    );
    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'private-evidence',
      Key: 'random.jpg',
      Body: bytes,
      ContentType: 'image/jpeg',
    });
    expect(command.input.ACL).toBeUndefined();
  });
  it('reads from the private bucket through the backend and deletes only the supplied rollback object', async () => {
    const bytes = Buffer.from('image');
    send
      .mockResolvedValueOnce({
        ContentLength: bytes.length,
        Body: { transformToByteArray: async () => bytes },
      })
      .mockResolvedValueOnce({});
    const storage = new EvidenceStorage();
    await expect(storage.get('s3:random.jpg')).resolves.toEqual(bytes);
    await storage.remove('s3:random.jpg');
    expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
    expect(send.mock.calls[1][0]).toBeInstanceOf(DeleteObjectCommand);
    expect(send.mock.calls[1][0].input).toEqual({
      Bucket: 'private-evidence',
      Key: 'random.jpg',
    });
    storage.onModuleDestroy();
    expect(destroy).toHaveBeenCalled();
  });
  it('rejects oversized downloads and surfaces write failures without local fallback', async () => {
    send
      .mockResolvedValueOnce({ ContentLength: 6 * 1024 * 1024, Body: {} })
      .mockRejectedValueOnce(new Error('Storage unavailable'));
    const storage = new EvidenceStorage();
    await expect(storage.get('s3:random.jpg')).rejects.toThrow(
      'Invalid evidence object',
    );
    await expect(
      storage.put('random.jpg', Buffer.from('image')),
    ).rejects.toThrow('Storage unavailable');
  });
});
