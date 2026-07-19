const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const root = path.resolve(__dirname, '..');
const buildDir = path.join(root, 'build');
const distDir = path.join(root, 'dist');
const outFile = path.join(distDir, 'vortex-farever-extension.zip');

fs.mkdirSync(distDir, { recursive: true });
if (fs.existsSync(outFile)) fs.rmSync(outFile);

const output = fs.createWriteStream(outFile);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`dist/vortex-farever-extension.zip -> ${archive.pointer()} bytes`);
});
archive.on('error', err => {
  throw err;
});

archive.pipe(output);
archive.directory(buildDir, false);
archive.finalize();
