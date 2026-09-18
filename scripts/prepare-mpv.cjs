/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const release =
    'https://github.com/shinchiro/mpv-winbuild-cmake/releases/download/20260903/mpv-x86_64-20260903-git-69e63f425a.7z';
const archiveHash = '418dbfb5feb851cbed33d6c05d8481ba71802621bfd6efe8974522b28d42ac97';
const binaryHash = '4a0bc712bc98e6f80cd980930b74b6ac202b8ccf2041e887adab69906f82731c';
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

async function prepare(context) {
    if (context && context.electronPlatformName !== 'win32') return;
    if (context && require('electron-builder').Arch[context.arch] !== 'x64') return;
    const root = path.resolve(__dirname, '..');
    const destination = path.join(root, 'assets/mpv/x64');
    const binary = path.join(destination, 'mpv.exe');
    if (
        await fs
            .readFile(binary)
            .then((data) => sha256(data) === binaryHash)
            .catch(() => false)
    )
        return;
    const cache = path.join(root, '.scratch/mpv-download');
    await fs.mkdir(cache, { recursive: true });
    await fs.mkdir(destination, { recursive: true });
    const response = await fetch(release);
    if (!response.ok) throw new Error(`MPV download failed: ${response.status}`);
    const archive = Buffer.from(await response.arrayBuffer());
    if (sha256(archive) !== archiveHash) throw new Error('MPV archive checksum mismatch');
    const archivePath = path.join(cache, 'mpv.7z');
    await fs.writeFile(archivePath, archive);
    execFileSync('tar', ['-xf', archivePath, '-C', destination, 'mpv.exe', 'd3dcompiler_43.dll']);
    if (sha256(await fs.readFile(binary)) !== binaryHash)
        throw new Error('MPV binary checksum mismatch');
}

module.exports = prepare;
if (require.main === module)
    prepare().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
