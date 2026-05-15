# Ejecutar desde apps\web:
#   npm run android:assemble-debug
#   o:  .\android-assemble-debug.ps1
#
# Si falla "Could not move temporary workspace ... transforms":
# 1. Cierra Android Studio por completo.
# 2. En PowerShell como Administrador ejecuta (ajusta rutas si hace falta):
#      Add-MpPreference -ExclusionPath "$env:LOCALAPPDATA\GradleChatTikets"
#      Add-MpPreference -ExclusionPath "$env:USERPROFILE\.gradle"
#      Add-MpPreference -ExclusionPath "C:\wamp64\www\PROYECTOS DEINER\chat-tikets\apps\web\android"
# 3. Vuelve a ejecutar este script.
$ErrorActionPreference = 'Stop'
$appsWeb = $PSScriptRoot

function Get-DotEnvValue {
  param([string]$FilePath, [string]$Key)
  if (-not (Test-Path -LiteralPath $FilePath)) { return $null }
  foreach ($line in Get-Content -LiteralPath $FilePath -Encoding UTF8) {
    $t = $line.Trim()
    if ($t -eq '' -or $t.StartsWith('#')) { continue }
    $escapedKey = [regex]::Escape($Key)
    if ($t -match "^(?:export\s+)?$escapedKey=(.*)$") {
      $v = $matches[1].Trim()
      if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
        $v = $v.Substring(1, $v.Length - 2)
      }
      return $v
    }
  }
  return $null
}

function Test-EnvApiOrigin([string]$u) {
  if (-not $u) { return $false }
  $t = $u.Trim()
  if ($t -eq '') { return $false }
  if ($t -match 'tu-dominio') { return $false }
  return $true
}

# APK/Capacitor: la URL del API va incrustada en el bundle (VITE_*). Sin esto no hay conexión al backend (p. ej. Easypanel).
if (-not $env:VITE_API_ORIGIN -or ($env:VITE_API_ORIGIN.Trim() -eq '')) {
  $repoRoot = (Resolve-Path (Join-Path $appsWeb '..\..')).Path
  $easypanelEnv = Join-Path $repoRoot '.env.easypanel'
  $webProdEnv = Join-Path $appsWeb '.env.production'
  $fromEasypanel = Get-DotEnvValue -FilePath $easypanelEnv -Key 'VITE_API_ORIGIN'
  $fromWebProd = Get-DotEnvValue -FilePath $webProdEnv -Key 'VITE_API_ORIGIN'
  $picked = $null
  $src = $null
  if (Test-EnvApiOrigin $fromEasypanel) {
    $picked = $fromEasypanel.Trim().TrimEnd('/')
    $src = '.env.easypanel (raíz del repo)'
  }
  elseif (Test-EnvApiOrigin $fromWebProd) {
    $picked = $fromWebProd.Trim().TrimEnd('/')
    $src = 'apps/web/.env.production'
  }
  if ($picked) {
    $env:VITE_API_ORIGIN = $picked
    Write-Host "VITE_API_ORIGIN=$($env:VITE_API_ORIGIN) (desde $src)"
  }
}
if (-not $env:VITE_API_ORIGIN -or ($env:VITE_API_ORIGIN.Trim() -eq '')) {
  Write-Warning 'VITE_API_ORIGIN vacío: copia `.env.easypanel.example` -> `.env.easypanel` en la raíz con tu URL HTTPS del API, o crea `apps/web/.env.production`, o exporta la variable antes de ejecutar este script.'
}

$env:GRADLE_USER_HOME = Join-Path $env:LOCALAPPDATA 'GradleChatTikets'
New-Item -ItemType Directory -Force -Path $env:GRADLE_USER_HOME | Out-Null
Write-Host "GRADLE_USER_HOME=$($env:GRADLE_USER_HOME)"

# Quita stale transforms antes de Gradle (Studio cerrado recomendado)
$cachesRoot = Join-Path $env:GRADLE_USER_HOME 'caches'
if (Test-Path -LiteralPath $cachesRoot) {
  Get-ChildItem -LiteralPath $cachesRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $t = Join-Path $_.FullName 'transforms'
    if (Test-Path -LiteralPath $t) {
      Write-Host "Limpiando transforms: $t"
      Remove-Item -Recurse -Force -LiteralPath $t -ErrorAction SilentlyContinue
    }
  }
}

Set-Location $appsWeb
npm run cap:sync:android
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Set-Location (Join-Path $appsWeb 'android')
& .\gradlew.bat --stop 2>$null
& .\gradlew.bat assembleDebug --no-build-cache --no-daemon
exit $LASTEXITCODE
