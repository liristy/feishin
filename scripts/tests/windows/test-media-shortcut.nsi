; makensis /DTEST_DIR=<absolute scratch directory> scripts/tests/windows/test-media-shortcut.nsi
; Run media-shortcut-test.exe silently; exit code 0 means all checks passed.
!include LogicLib.nsh
!define FEISHIN_MEDIA_SHORTCUT_DIR "$INSTDIR\start-menu\Feishin"
!include "..\..\..\assets\installer.nsh"

Name "Feishin media shortcut test"
OutFile "${TEST_DIR}\media-shortcut-test.exe"
InstallDir "${TEST_DIR}\install"
RequestExecutionLevel user
SilentInstall silent

Section
  ; Fresh installs must not add a second application entry, on any architecture.
  !insertmacro customInstall
  ${If} ${FileExists} "${FEISHIN_MEDIA_SHORTCUT_DIR}\Feishin.lnk"
    SetErrorLevel 1
    Quit
  ${EndIf}

  ; Upgrades remove both visible and hidden legacy links, preserving other files.
  CreateDirectory "${FEISHIN_MEDIA_SHORTCUT_DIR}"
  FileOpen $0 "${FEISHIN_MEDIA_SHORTCUT_DIR}\keep.txt" w
  FileClose $0
  CreateShortCut "${FEISHIN_MEDIA_SHORTCUT_DIR}\Feishin.lnk" "$INSTDIR\mpv.exe"
  !insertmacro customInstall
  ${If} ${FileExists} "${FEISHIN_MEDIA_SHORTCUT_DIR}\Feishin.lnk"
    SetErrorLevel 2
    Quit
  ${EndIf}
  CreateShortCut "${FEISHIN_MEDIA_SHORTCUT_DIR}\Feishin.lnk" "$INSTDIR\mpv.exe"
  SetFileAttributes "${FEISHIN_MEDIA_SHORTCUT_DIR}\Feishin.lnk" HIDDEN
  !insertmacro customInstall
  ${If} ${FileExists} "${FEISHIN_MEDIA_SHORTCUT_DIR}\Feishin.lnk"
    SetErrorLevel 3
    Quit
  ${EndIf}
  ; Uninstall also cleans up a legacy shortcut.
  CreateShortCut "${FEISHIN_MEDIA_SHORTCUT_DIR}\Feishin.lnk" "$INSTDIR\mpv.exe"
  !insertmacro customUnInstall
  ${If} ${FileExists} "${FEISHIN_MEDIA_SHORTCUT_DIR}\Feishin.lnk"
    SetErrorLevel 6
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
