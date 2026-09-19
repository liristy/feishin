; electron-builder loads this include from buildResources for every NSIS release channel.
!ifndef FEISHIN_MEDIA_SHORTCUT_DIR
  !define FEISHIN_MEDIA_SHORTCUT_DIR "$SMPROGRAMS\Feishin"
!endif

!macro customInstall
  ; SMTC resolves the MPV process through a shortcut to its actual executable.
  ; Leave the AppUserModelID unset so Windows can match the executable path.
  ${If} ${FileExists} "$INSTDIR\resources\assets\mpv\x64\mpv.exe"
    CreateDirectory "${FEISHIN_MEDIA_SHORTCUT_DIR}"
    CreateShortCut "${FEISHIN_MEDIA_SHORTCUT_DIR}\Feishin.lnk" \
      "$INSTDIR\resources\assets\mpv\x64\mpv.exe" "" "$INSTDIR\Feishin.exe" 0
  ${EndIf}
!macroend

!macro customUnInstall
  Delete "${FEISHIN_MEDIA_SHORTCUT_DIR}\Feishin.lnk"
  RMDir "${FEISHIN_MEDIA_SHORTCUT_DIR}"
!macroend
