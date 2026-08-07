$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$startupDir = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "Jarvis.lnk"
$cmdPath = Join-Path $PSScriptRoot "JarvisStartup.cmd"
$appBat = Join-Path $root "start-app.bat"

@"
@echo off
cd /d "$root"
if exist "$appBat" (
  start "" "$appBat"
) else (
  start "" /min cmd /c "node server.js --no-open"
)
"@ | Set-Content -Path $cmdPath -Encoding ASCII

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $cmdPath
$shortcut.WorkingDirectory = $root
$shortcut.WindowStyle = 7
$shortcut.Description = "Jarvis desktop assistant startup"
$shortcut.Save()

Write-Host "Jarvis App se iniciara al iniciar sesion."
Write-Host "Acceso directo: $shortcutPath"
Write-Host "Tip: usa start-app.bat para abrirlo como app (no navegador)."
