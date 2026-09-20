# Bundled MPV

Windows x64 uses MPV v0.41.0-1023-g69e63f425 from the
[20260903 shinchiro build](https://github.com/shinchiro/mpv-winbuild-cmake/releases/tag/20260903),
a Windows build linked by [mpv.io](https://mpv.io/installation/).

Run `node scripts/build/prepare-mpv.cjs` before desktop development. Windows x64 packaging
runs this automatically and verifies pinned archive and executable SHA-256 hashes.
The generated `x64` directory is excluded from Git and included in application resources.
The application starts MPV with `--no-config` and `--load-scripts=no`.

Source: [mpv commit 69e63f425a](https://github.com/mpv-player/mpv/tree/69e63f425a).
Build scripts and dependency source revisions:
[mpv-winbuild-cmake](https://github.com/shinchiro/mpv-winbuild-cmake/tree/20260903).
See the accompanying Copyright and license files.
