# Genera instalador NSIS (.exe) para Windows.
# Ejecutar desde apps\web:
#   npm run windows:installer
#
# Requiere: Node 18+, apps/web/dist (build:desktop) y apps/desktop con electron-builder.
$ErrorActionPreference = 'Stop'
$appsWeb = $PSScriptRoot
$appsDesktop = Join-Path $appsWeb '..\desktop'

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
  $t = $u.Trim().ToLowerInvariant()
  if ($t -eq '') { return $false }
  if ($t -match 'tu-dominio') { return $false }
  if ($t -match 'cambia-por-tu') { return $false }
  if ($t -match 'tu-url-publica') { return $false }
  if ($t -match 'change-for-your') { return $false }
  return $true
}

if ($env:VITE_API_ORIGIN -and -not (Test-EnvApiOrigin $env:VITE_API_ORIGIN)) {
  Write-Warning 'VITE_API_ORIGIN del entorno parece un placeholder; se ignora.'
  Remove-Item Env:\VITE_API_ORIGIN -ErrorAction SilentlyContinue
}

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
  Write-Warning 'VITE_API_ORIGIN vacío: el instalador usará el fallback de producción en api.ts o fallará el login. Configura `.env.easypanel` o `apps/web/.env.production`.'
}

Write-Host '--- Build SPA (base ./ para Electron file://) ---'
$env:VITE_DESKTOP_SHELL = 'true'
Set-Location $appsWeb
npm run build:desktop
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$indexHtml = Join-Path $appsWeb 'dist\index.html'
if (-not (Test-Path -LiteralPath $indexHtml)) {
  throw "No existe $indexHtml tras build:desktop"
}
$head = (Get-Content -LiteralPath $indexHtml -First 15) -join "`n"
if ($head -match 'src="/assets/') {
  throw 'dist/index.html aún usa rutas absolutas /assets; revisa vite build --base ./'
}

Write-Host '--- Instalador Electron (NSIS) ---'
Set-Location $appsDesktop
if (-not (Test-Path -LiteralPath (Join-Path $appsDesktop 'node_modules'))) {
  npm install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
npm run dist
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$releaseDir = Join-Path $appsDesktop 'release'
$setup = Get-ChildItem -LiteralPath $releaseDir -Filter 'ChatTickets-Setup-*.exe' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) {
  $setup = Get-ChildItem -LiteralPath $releaseDir -Filter '*Setup*.exe' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
if ($setup) {
  Write-Host ''
  Write-Host "Instalador listo: $($setup.FullName)"
} else {
  Write-Host "Revisa artefactos en: $releaseDir"
}
