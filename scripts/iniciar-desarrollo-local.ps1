# Arranque local: Postgres (Docker) + API :3030 + Web Vite :5173
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\iniciar-desarrollo-local.ps1
#   scripts\iniciar-desarrollo-local.ps1 -NoForzarPuertos   # no cerrar :3030 / :5173
#   scripts\iniciar-desarrollo-local.ps1 -SinNavegador
# Por defecto cierra procesos que escuchen en :3030 y :5173 antes de arrancar.

param(
    [switch] $ForzarPuertos,
    [switch] $NoForzarPuertos,
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
# Por defecto libera :3030 y :5173 antes de arrancar. -NoForzarPuertos conserva procesos existentes.
$FreePorts = -not $NoForzarPuertos
if ($ForzarPuertos) { $FreePorts = $true }

function Test-Command([string] $Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Ensure-NpmInstall([string] $Dir, [string] $Label) {
    $pkg = Join-Path $Dir 'package.json'
    $nm = Join-Path $Dir 'node_modules'
    if (-not (Test-Path $pkg)) {
        throw "No se encontró package.json en $Dir"
    }
    if (Test-Path $nm) { return }
    Write-Host "  Instalando dependencias de $Label (npm install)..." -ForegroundColor Yellow
    Push-Location $Dir
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install falló en $Label (código $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
    Write-Host "  Listo: $Label" -ForegroundColor Green
}

function Sync-Prisma([string] $ApiDirectory, [switch] $ApiPortFree) {
    Push-Location $ApiDirectory
    try {
        Write-Host '  Aplicando migraciones Prisma (migrate deploy)...' -ForegroundColor Yellow
        npx prisma migrate deploy
        if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy falló (código $LASTEXITCODE)" }

        if ($ApiPortFree) {
            Write-Host '  Generando cliente Prisma (generate)...' -ForegroundColor Yellow
            npx prisma generate
            if ($LASTEXITCODE -ne 0) { throw "prisma generate falló (código $LASTEXITCODE)" }
        } else {
            Write-Host '  [AVISO] API ya en :3030 — omitiendo prisma generate (EPERM si el DLL está en uso).' -ForegroundColor DarkYellow
            Write-Host '          Tras cambios de schema: cierra el API o ejecuta cd apps\api && npx prisma generate' -ForegroundColor DarkYellow
        }
    } finally {
        Pop-Location
    }
}

function Get-ListenerPids([int] $Port) {
    $pids = @()
    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
        $pids = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique |
            Where-Object { $_ -and $_ -gt 0 })
    }
    if ($pids.Count -eq 0) {
        $pattern = ":$Port\s"
        netstat -ano -p tcp 2>$null | Select-String 'LISTENING' | Select-String $pattern | ForEach-Object {
            $parts = ($_.Line -split '\s+') | Where-Object { $_ -ne '' }
            if ($parts.Count -ge 1) {
                $tail = $parts[-1]
                if ($tail -match '^\d+$') { $pids += [int]$tail }
            }
        }
        $pids = @($pids | Select-Object -Unique)
    }
    return $pids
}

function Stop-PortListeners([int] $Port, [string] $Label) {
    $pids = @(Get-ListenerPids $Port)
    if ($pids.Count -eq 0) {
        Write-Host "  - :$Port libre ($Label)." -ForegroundColor DarkGray
        return
    }
    foreach ($procId in $pids) {
        try {
            $proc = Get-Process -Id $procId -ErrorAction Stop
            Write-Host "  - Cerrando $Label en :$Port (PID $procId, $($proc.ProcessName))..." -ForegroundColor Yellow
            Stop-Process -Id $procId -Force -ErrorAction Stop
        } catch {
            Write-Host "  - No se pudo cerrar PID $procId en :$Port : $($_.Exception.Message)" -ForegroundColor DarkYellow
        }
    }
    Start-Sleep -Seconds 1
    if (@(Get-ListenerPids $Port).Count -gt 0) {
        Write-Host "  - [AVISO] :$Port sigue en uso tras intentar cerrar procesos." -ForegroundColor DarkYellow
    }
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

if (-not (Test-Command 'node')) {
    Write-Host '[ERROR] Node.js no está en el PATH.' -ForegroundColor Red
    exit 1
}
if (-not (Test-Command 'npm')) {
    Write-Host '[ERROR] npm no está en el PATH.' -ForegroundColor Red
    exit 1
}

Write-Host '[0] Dependencias npm, puertos y Prisma...' -ForegroundColor White
try {
    Ensure-NpmInstall $ApiDir 'API'
    Ensure-NpmInstall $WebDir 'Web'
} catch {
    Write-Host "  [ERROR] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

if ($FreePorts) {
    Write-Host '  Liberando puertos de desarrollo (3030 API, 5173 Web)...' -ForegroundColor Yellow
    Stop-PortListeners $ApiPort 'API'
    Stop-PortListeners $WebPort 'Web'
    Write-Host ''
} else {
    Write-Host '  Modo -NoForzarPuertos: no se cierran procesos en :3030 / :5173.' -ForegroundColor DarkYellow
    Write-Host ''
}

$apiPortFree = -not (Test-PortListening $ApiPort)
try {
    Sync-Prisma $ApiDir -ApiPortFree:$apiPortFree
} catch {
    Write-Host "  [ERROR] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
$envFile = Join-Path $ApiDir '.env'
if (-not (Test-Path $envFile)) {
    $example = Join-Path $ApiDir '.env.example'
    Write-Host '  [AVISO] No existe apps\api\.env' -ForegroundColor DarkYellow
    if (Test-Path $example) {
        Write-Host '          Copie apps\api\.env.example a apps\api\.env y ajuste DATABASE_URL.' -ForegroundColor DarkYellow
    }
}
Write-Host ''

Write-Host '[1/4] PostgreSQL (Docker)...' -ForegroundColor White
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

Write-Host '[2/4] API Nest (puerto 3030)...' -ForegroundColor White
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

Write-Host '[3/4] Web Vite (puerto 5173)...' -ForegroundColor White
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

Write-Host '[4/4] Resumen' -ForegroundColor White
Write-Host 'Listo.' -ForegroundColor Green
Write-Host "  Web:  http://localhost:${WebPort}/login" -ForegroundColor Cyan
Write-Host "  API:  http://localhost:${ApiPort}/api/v1/docs" -ForegroundColor Cyan
Write-Host '  BD:   PostgreSQL en :5432 (Docker) — migraciones: cd apps\api && npx prisma migrate deploy' -ForegroundColor Gray
Write-Host '  Si el login falla, confirma que el API en :3030 esté arriba (no solo Vite).' -ForegroundColor Gray
Write-Host '  Reinicio sin cerrar puertos: INICIAR-LOCAL.bat --sin-forzar' -ForegroundColor Gray
Write-Host '  (--forzar sigue siendo alias de reinicio limpio)' -ForegroundColor Gray
Write-Host ''

if (-not $SinNavegador) {
    Start-Sleep -Seconds 1
    Start-Process $LoginUrl | Out-Null
}
