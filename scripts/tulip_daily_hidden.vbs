' Run tulip_daily.bat with NO console window (window close = task kill, 3 times 8/10-8/13)
' ASCII only. Path is derived from this script's own location (Korean-path safe).
Set fso = CreateObject("Scripting.FileSystemObject")
d = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.Run """" & d & "\tulip_daily.bat""", 0, True   ' wait: task result tracks the bat
