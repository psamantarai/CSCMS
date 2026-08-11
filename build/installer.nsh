; PLAN 13.3: NSIS carve-out so update and uninstall never delete $INSTDIR\data.
;
; electron-builder's generated uninstaller Section runs the same code for a
; manual uninstall and for the silent uninstall of the old version that
; auto-update performs before laying down the new one (see un.${UNINSTALL_
; SECTION_NAME} in app-builder-lib's templates/nsis/uninstaller.nsh). Left
; alone it removes the whole install directory with `RMDir /r "$INSTDIR"`.
; Defining customRemoveFiles replaces that default entirely (electron-builder
; checks `!ifmacrodef customRemoveFiles` and skips its own file-removal block
; when present), so the exclusion below covers both paths for free.
;
; Walks the top level of $INSTDIR and removes every entry except "data",
; recursing into subfolders as it goes — mirrors the FindFirst/FindNext/
; IfFileExists idiom this same template file already uses (see
; un.atomicRMDir above) rather than naming individual app files, since that
; list changes across Electron/Chromium versions.
;
; ponytail: no busy-file rename-and-retry like the default un.atomicRMDir
; has for a locked exe mid-update — if that ever bites, add the same
; rename-to-$PLUGINSDIR-then-delete fallback here.
!macro customRemoveFiles
  Push $R0
  Push $R1
  FindFirst $R0 $R1 "$INSTDIR\*.*"
  loop:
    StrCmp $R1 "" break
    StrCmp $R1 "." continue
    StrCmp $R1 ".." continue
    StrCmp $R1 "data" continue

    IfFileExists "$INSTDIR\$R1\*.*" isDir isNotDir

    isDir:
      RMDir /r "$INSTDIR\$R1"
      Goto continue

    isNotDir:
      Delete "$INSTDIR\$R1"

    continue:
      FindNext $R0 $R1
      Goto loop

  break:
    FindClose $R0
    Pop $R1
    Pop $R0
!macroend
