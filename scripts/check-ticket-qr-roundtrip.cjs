// Decode an actual generated PNG with the same worker shipped to web clients.
// This checks image interoperability, not a physical camera or deployed route.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomBytes } = require('node:crypto');
const sharp = require('sharp');
const qr = require('qrcode');

async function main() {
  const expected = `https://traffic.example.org/verify#token=${randomBytes(32).toString('hex')}`;
  const png = await qr.toBuffer(expected, {
    width: 600,
    margin: 4,
    errorCorrectionLevel: 'M',
  });
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const source = fs.readFileSync(
    path.resolve(
      __dirname,
      '../node_modules/qr-scanner/qr-scanner-worker.min.js',
    ),
    'utf8',
  );
  let decoded;
  const worker = {
    postMessage: (result) => {
      decoded = result.data;
    },
  };
  vm.runInNewContext(
    source.replace('export const createWorker', 'const createWorker') +
      '\ncreateWorker();',
    {
      Blob: class {
        constructor(parts) {
          this.source = parts.join('');
        }
      },
      URL: { createObjectURL: (blob) => blob.source },
      Worker: class {
        constructor(code) {
          vm.runInNewContext(
            code,
            { self: worker, Uint8ClampedArray },
            { timeout: 10000 },
          );
        }
      },
    },
    { timeout: 10000 },
  );
  worker.onmessage({
    data: {
      id: 1,
      type: 'decode',
      data: {
        data: new Uint8ClampedArray(data),
        width: info.width,
        height: info.height,
      },
    },
  });
  assert.equal(decoded, expected);
  console.log(
    'PASS: generated ticket PNG decodes to the exact HTTPS verification URL. No token printed.',
  );
}
main().catch((error) => {
  console.error(error.name);
  process.exitCode = 1;
});
