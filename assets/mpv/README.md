# Bundled MPV

Windows x64 uses MPV v0.41.0-1023-g69e63f425 from the
[20260903 shinchiro build](https://github.com/shinchiro/mpv-winbuild-cmake/releases/tag/20260903),
a Windows build linked by [mpv.io](https://mpv.io/installation/).

The original rolling release download has expired. The unchanged upstream archive is
[mirrored with qMusic 2.0.0](https://github.com/liristy/feishin/releases/download/v2.0.0/mpv-x86_64-20260903-git-69e63f425a.7z)
so clean builds remain reproducible. Its SHA-256 is
`418dbfb5feb851cbed33d6c05d8481ba71802621bfd6efe8974522b28d42ac97`.
CI uses its existing `GH_TOKEN` to read this archive while the release is still a draft.

Run `node scripts/build/prepare-mpv.cjs` before desktop development. Windows x64 packaging
runs this automatically and verifies pinned archive and executable SHA-256 hashes.
The generated `x64` directory is excluded from Git and included in application resources.
The application starts MPV with `--no-config` and `--load-scripts=no`.

Source: [mpv commit 69e63f425a](https://github.com/mpv-player/mpv/tree/69e63f425a).
Build scripts and dependency source revisions:
[mpv-winbuild-cmake](https://github.com/shinchiro/mpv-winbuild-cmake/tree/20260903).
See the accompanying Copyright and license files.
