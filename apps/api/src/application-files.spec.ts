import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import sharp from 'sharp';
import { inspectApplicationFile } from './application-files';
const file = (
  buffer: Buffer,
  mimetype: string,
  originalname = 'document.pdf',
) =>
  ({
    buffer,
    mimetype,
    originalname,
    size: buffer.length,
  }) as Express.Multer.File;
describe('private application content inspection', () => {
  it('accepts flat PDFs and strips image metadata', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    expect(
      (
        await inspectApplicationFile(
          file(Buffer.from(await pdf.save()), 'application/pdf'),
        )
      ).mimeType,
    ).toBe('application/pdf');
    const image = await sharp({
      create: { width: 32, height: 32, channels: 3, background: '#ffffff' },
    })
      .jpeg()
      .withMetadata()
      .toBuffer();
    const safe = await inspectApplicationFile(
      file(image, 'image/jpeg', 'photo.jpg'),
    );
    expect((await sharp(safe.bytes).metadata()).exif).toBeUndefined();
  });
  it('rejects executable bytes, MIME spoofing, HEIC and active/encrypted PDF content', async () => {
    await expect(
      inspectApplicationFile(file(Buffer.from('MZ executable'), 'image/jpeg')),
    ).rejects.toThrow();
    await expect(
      inspectApplicationFile(
        file(Buffer.from('unsupported'), 'image/heic', 'photo.heic'),
      ),
    ).rejects.toThrow('Convert HEIC');
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.catalog.set(
      PDFName.of('OpenAction'),
      pdf.context.obj({ S: 'JavaScript', JS: PDFString.of('alert(1)') }),
    );
    await expect(
      inspectApplicationFile(
        file(Buffer.from(await pdf.save()), 'application/pdf'),
      ),
    ).rejects.toThrow('unsafe PDF');
  });
});
