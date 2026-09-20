; electron-builder loads this include from buildResources for every NSIS release channel.
!ifndef FEISHIN_MEDIA_SHORTCUT_DIR
  !define FEISHIN_MEDIA_SHORTCUT_DIR "$SMPROGRAMS\Feishin"
!endif

!macro customInstall
  ; Remove the legacy MPV shortcut. MPV now shares the real application's ID.
  Delete "${FEISHIN_MEDIA_SHORTCUT_DIR}\Feishin.lnk"
  RMDir "${FEISHIN_MEDIA_SHORTCUT_DIR}"
!macroend

!macro customUnInstall
  Delete "${FEISHIN_MEDIA_SHORTCUT_DIR}\Feishin.lnk"
  RMDir "${FEISHIN_MEDIA_SHORTCUT_DIR}"
!macroend
