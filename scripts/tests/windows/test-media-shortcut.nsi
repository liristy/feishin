; makensis /DTEST_DIR=<absolute scratch directory> scripts/tests/windows/test-media-shortcut.nsi
; Run media-shortcut-test.exe silently; exit code 0 means all checks passed.
!include LogicLib.nsh
!define FEISHIN_MEDIA_SHORTCUT_DIR "$INSTDIR\start-menu\Feishin"
!include "..\assets\installer.nsh"

Name "Feishin media shortcut test"
OutFile "${TEST_DIR}\media-shortcut-test.exe"
InstallDir "${TEST_DIR}\install"
RequestExecutionLevel user
SilentInstall silent

Section
  ; Architectures without bundled MPV must not register a broken shortcut.
  !insertmacro customInstall
  ${If} ${FileExists} "${FEISHIN_MEDIA_SHORTCUT_DIR}\Feishin.lnk"
    SetErrorLevel 1
    Quit
  ${EndIf}

  CreateDirectory "$INSTDIR\resources\assets\mpv\x64"
  FileOpen $0 "$INSTDIR\resources\assets\mpv\x64\mpv.exe" w
  FileClose $0
  !insertmacro customInstall
  ${IfNot} ${FileExists} "${FEISHIN_MEDIA_SHORTCUT_DIR}\Feishin.lnk"
    SetErrorLevel 2
    Quit
  ${EndIf}

  ; Upgrading refreshes the same registration, and uninstall removes only our link.
  !insertmacro customInstall
  FileOpen $0 "${FEISHIN_MEDIA_SHORTCUT_DIR}\keep.txt" w
  FileClose $0
  !insertmacro customUnInstall
  ${If} ${FileExists} "${FEISHIN_MEDIA_SHORTCUT_DIR}\Feishin.lnk"
    SetErrorLevel 3
    Quit
  ${EndIf}
  ${IfNot} ${FileExists} "${FEISHIN_MEDIA_SHORTCUT_DIR}\keep.txt"
    SetErrorLevel 4
    Quit
  ${EndIf}
  Delete "${FEISHIN_MEDIA_SHORTCUT_DIR}\keep.txt"
  !insertmacro customUnInstall
  IfFileExists "${FEISHIN_MEDIA_SHORTCUT_DIR}\*.*" 0 passed
    SetErrorLevel 5
    Quit
  passed:
    SetErrorLevel 0
SectionEnd
