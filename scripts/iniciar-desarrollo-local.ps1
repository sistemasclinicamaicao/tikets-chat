# Arranque local: Postgres (Docker) + API :3030 + Web Vite :5173
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\iniciar-desarrollo-local.ps1
#   scripts\iniciar-desarrollo-local.ps1 -ForzarPuertos
#   scripts\iniciar-desarrollo-local.ps1 -SinNavegador

param(
    [switch] $ForzarPuertos,
    [switch] $SinNavegador
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$ApiDir = Join-Path $RepoRoot 'apps\api'
$WebDir = Join-Path $RepoRoot 'apps\web'
$ComposeFile = Join-Path $RepoRoot 'docker-compose.local-db.yml'
$ApiPort = 3030
$WebPort = 5173
$HealthUrl = "http://127.0.0.1:${ApiPort}/api/v1/health"
$LoginUrl = "http://localhost:${WebPort}/login"

function Get-ListenerPids([int] $Port) {
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        Where-Object { $_ -and $_ -gt 0 }
}

function Stop-PortListeners([int] $Port, [string] $Label) {
    $pids = @(Get-ListenerPids $Port)
    if ($pids.Count -eq 0) { return }
    foreach ($procId in $pids) {
        try {
            $proc = Get-Process -Id $procId -ErrorAction Stop
            Write-Host "  - Cerrando $Label (PID $procId, $($proc.ProcessName))..." -ForegroundColor Yellow
            Stop-Process -Id $procId -Force -ErrorAction Stop
        } catch {
            Write-Host "  - No se pudo cerrar PID $procId : $($_.Exception.Message)" -ForegroundColor DarkYellow
        }
    }
    Start-Sleep -Seconds 1
}

function Test-PortListening([int] $Port) {
    return [bool](Get-ListenerPids $Port)
}

function Start-DevWindow([string] $Title, [string] $WorkDir, [string] $Command) {
    $cmdLine = "cd /d `"$WorkDir`" && $Command"
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $cmdLine -WindowStyle Normal | Out-Null
    Write-Host "  Ventana: $Title" -ForegroundColor Green
}

Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ' Chat-Tikets - desarrollo local' -ForegroundColor Cyan
Write-Host " Repo: $RepoRoot" -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''

if ($ForzarPuertos) {
    Write-Host '[0] Liberando puertos 3030 y 5173 ( -ForzarPuertos )...' -ForegroundColor Yellow
    Stop-PortListeners $ApiPort 'API'
    Stop-PortListeners $WebPort 'Web'
    Write-Host ''
}

Write-Host '[1/3] PostgreSQL (Docker)...' -ForegroundColor White
if (Test-Path $ComposeFile) {
    try {
        Push-Location $RepoRoot
        docker compose -f $ComposeFile up -d 2>&1 | ForEach-Object { Write-Host "  $_" }
        if ($LASTEXITCODE -ne 0) {
            Write-Host '  [AVISO] Compose falló. ¿Docker Desktop encendido? Si Postgres ya corre en :5432, puedes continuar.' -ForegroundColor DarkYellow
        }
    } catch {
        Write-Host "  [AVISO] $($_.Exception.Message)" -ForegroundColor DarkYellow
    } finally {
        Pop-Location
    }
} else {
    Write-Host '  [AVISO] No se encontró docker-compose.local-db.yml' -ForegroundColor DarkYellow
}
Write-Host ''

$apiRunning = Test-PortListening $ApiPort
$webRunning = Test-PortListening $WebPort

Write-Host '[2/3] API Nest (puerto 3030)...' -ForegroundColor White
if ($apiRunning) {
    Write-Host "  Ya hay un servicio en :$ApiPort. No se abre otra ventana de API." -ForegroundColor DarkYellow
    Write-Host "  Si no es el API de este proyecto, usa -ForzarPuertos o cierra ese proceso." -ForegroundColor DarkYellow
} else {
    if (-not (Test-Path (Join-Path $ApiDir 'package.json'))) {
        Write-Host "  [ERROR] No existe $ApiDir" -ForegroundColor Red
        exit 1
    }
    Start-DevWindow 'chat-tikets API (3030)' $ApiDir 'npm run start:dev'
    Write-Host '  Esperando health del API...' -ForegroundColor Gray
    $deadline = (Get-Date).AddSeconds(90)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 3
            if ($resp.StatusCode -eq 200) {
                $ready = $true
                break
            }
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    if ($ready) {
        Write-Host '  API listo.' -ForegroundColor Green
    } else {
        Write-Host '  [AVISO] El API aún no respondió en /health. Revisa la ventana del API (Prisma, .env, Postgres).' -ForegroundColor DarkYellow
    }
}
Write-Host ''

Write-Host '[3/3] Web Vite (puerto 5173)...' -ForegroundColor White
if ($webRunning) {
    Write-Host "  Ya hay un servicio en :$WebPort (suele ser Vite). No se abre otra ventana." -ForegroundColor DarkYellow
    Write-Host "  Abre: $LoginUrl" -ForegroundColor Cyan
} else {
    if (-not (Test-Path (Join-Path $WebDir 'package.json'))) {
        Write-Host "  [ERROR] No existe $WebDir" -ForegroundColor Red
        exit 1
    }
    Start-DevWindow 'chat-tikets Web (5173)' $WebDir 'npm run dev'
    Start-Sleep -Seconds 2
}
Write-Host ''

Write-Host 'Listo.' -ForegroundColor Green
Write-Host "  Web:  http://localhost:${WebPort}/login" -ForegroundColor Cyan
Write-Host "  API:  http://localhost:${ApiPort}/api/v1/docs" -ForegroundColor Cyan
Write-Host '  Requisitos: npm install en apps\api y apps\web; apps\api\.env con DATABASE_URL.' -ForegroundColor Gray
Write-Host '  Si el login falla, confirma que el API en :3030 esté arriba (no solo Vite).' -ForegroundColor Gray
Write-Host '  Reinicio limpio: scripts\iniciar-desarrollo-local.ps1 -ForzarPuertos' -ForegroundColor Gray
Write-Host ''

if (-not $SinNavegador) {
    Start-Sleep -Seconds 1
    Start-Process $LoginUrl | Out-Null
}
