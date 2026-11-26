# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-11-26

- 曲目和收藏在刷新期间保留已显示的歌曲。连续滚动列表按小批次加载，减少重复传输。
- Navidrome 曲目和收藏通过轻量请求更新总数。
- 改进逐字歌词的时间解析、合唱声部显示和滚动过渡。

## [2.0.0] - 2026-10-25

### Added

- Add an always-on-top desktop player with synchronized lyrics and queue panels.
- Provide Windows x64 and ARM64 installers and ZIP archives on the stable release channel.

### Changed

- Unify the home page, sidebar, player controls, and fullscreen player with Apple Music styling.
- Float the in-app playerbar across pages and scroll long track metadata.
- Refine artwork sizing, cover flow backgrounds, fullscreen transitions, and button focus.
- Refresh the README and screenshots for the 2.0 interface and desktop player.

### Fixed

- Remove extra polling delay from floating lyrics and apply lyric offsets consistently.
- Clear lyric blur while manually browsing and unify seek slider thumbs.

See the [2.0.0 release notes](docs/releases/2.0.0.md) for installation and upgrade details.

## [1.15.2] - 2026-09-19

### Changed

- Refresh the home page, sidebar, player, icons, typography, and default themes.
- Bundle the application appearance instead of loading custom CSS overrides.
- Reduce sidebar playlist covers and expose the saved drag-and-drop ordering toggle.
- Preserve the frameless layout, raise its drag region above page backgrounds, and simplify window controls.
- Persist favorites sorting independently from the song library.
- Bundle MPV for Windows x64 and synchronize queued tracks across asynchronous playback changes.
- Use `liristy/feishin` for release notes and application updates.
