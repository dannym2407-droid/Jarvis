$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$startupDir = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "Jarvis.lnk"
$cmdPath = Join-Path $PSScriptRoot "JarvisStartup.cmd"

@"
@echo off
cd /d "$root"
start "" /min cmd /c "node server.js --greet"
"@ | Set-Content -Path $cmdPath -Encoding ASCII

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $cmdPath
$shortcut.WorkingDirectory = $root
$shortcut.WindowStyle = 7
$shortcut.Description = "Jarvis assistant startup"
$shortcut.Save()

Write-Host "Jarvis se iniciara al iniciar sesion."
Write-Host "Acceso directo: $shortcutPath"
