# 构建与测试脚本

所有命令均从仓库根目录执行，先按 `package.json` 指定的包管理器安装依赖。

## 构建辅助脚本

| 脚本 | 用途 | 入口 |
| --- | --- | --- |
| `build/prepare-mpv.cjs` | 准备并校验 Windows x64 MPV | `node scripts/build/prepare-mpv.cjs`；打包时自动调用 |
| `build/update-app-stream.mjs` | 更新 Linux AppStream 发布版本 | `pnpm postversion`；会修改 `build/linux/org.jeffvli.feishin.metainfo.xml` |
| `build/after-all-artifact-build.mjs` | Linux 构建后的 AppStream 处理 | electron-builder 钩子 |

## Node.js 回归检查

`tests/unit/` 包含播放器状态同步、封面背景、歌词交互、波形、收藏排序、离线下载与缓存、Windows 媒体控制等检查，使用内置断言和受控依赖运行，不需要启动完整应用。

```sh
pnpm test
node scripts/tests/unit/test-offline.cjs
```

`test-mpv-sync.cjs` 同时提供部分检查复用的源码加载函数。离线检查使用本地 HTTP 服务和临时文件，覆盖播放接口的 302 下载链路。

## Electron 检查

`tests/electron/` 使用 Electron 运行，相关测试使用独立临时配置。需要图形环境；部分测试会显示测试窗口。

以下三个检查直接加载被测代码：

```sh
pnpm exec electron scripts/tests/electron/test-cover-flow-canvas.cjs
pnpm exec electron scripts/tests/electron/test-text-scrolling.cjs
pnpm exec electron scripts/tests/electron/test-offline-electron.cjs
```

完整界面检查需要先构建桌面应用：

```sh
pnpm build:electron
pnpm exec electron scripts/tests/electron/test-download-management-electron.cjs
node scripts/tests/electron/test-player-restore-electron.cjs
pnpm exec electron scripts/tests/electron/test-playerbar-layout-electron.cjs
```

## Windows 安装检查

`tests/windows/test-media-shortcut.nsi` 是 NSIS 快捷方式检查脚本，需要安装 `makensis`，并通过 `/DTEST_DIR` 指定独立临时目录。具体调用方法见文件顶部说明。

临时脚本、截图、日志及安装备份放入 `.scratch/`。需要长期保留的回归检查放入对应测试目录，并在本说明中补充运行方法。
