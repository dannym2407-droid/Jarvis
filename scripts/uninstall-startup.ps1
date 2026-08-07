$ErrorActionPreference = "Stop"
$startupDir = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "Jarvis.lnk"
$cmdPath = Join-Path $PSScriptRoot "JarvisStartup.cmd"

if (Test-Path $shortcutPath) {
  Remove-Item $shortcutPath -Force
  Write-Host "Eliminado acceso directo de Startup."
} else {
  Write-Host "No habia acceso directo de Jarvis en Startup."
}

if (Test-Path $cmdPath) {
  Remove-Item $cmdPath -Force
}

Write-Host "Listo."
