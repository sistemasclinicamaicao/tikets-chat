#Requires -Version 5.1
<#
  Genera tres respaldos en backups/<timestamp>/:
    01-database-full.dump     — PostgreSQL completo (formato custom pg_restore)
    02-chat-only.dump         — Solo tablas chat_* (mismo formato)
    02-chat-only-data.sql     — Solo datos chat (INSERTs, legible)
    03-aplicacion-src.zip     — Código apps/ + ejemplos .env (sin node_modules, dist, .git)

  Lee DATABASE_URL desde apps\api\.env.
  Si el host es localhost/127.0.0.1, usa host.docker.internal para pg_dump dentro de Docker.
  Los binarios de adjuntos de chat viven en S3/MinIO (storage_key); este script no los descarga.
#>
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)
$ErrorActionPreference = 'Stop'

$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = Join-Path $RepoRoot "backups\$ts"
New-Item -ItemType Directory -Path $out -Force | Out-Null

$envFile = Join-Path $RepoRoot 'apps\api\.env'
if (-not (Test-Path $envFile)) { throw "No existe $envFile" }

$dbUrl = $null
Get-Content $envFile -Encoding UTF8 | ForEach-Object {
  if ($_ -match '^\s*DATABASE_URL\s*=\s*(.+)\s*$') {
    $dbUrl = $matches[1].Trim().Trim('"').Trim("'")
  }
}
if ([string]::IsNullOrWhiteSpace($dbUrl)) { throw 'DATABASE_URL no encontrado en apps\api\.env' }

$dockerDbUrl = $dbUrl `
  -replace '@localhost:', '@host.docker.internal:' `
  -replace '@127\.0\.0\.1:', '@host.docker.internal:'
# Prisma usa ?schema=public; libpq/pg_dump no lo acepta en la URI.
$pgDumpUrl = $dockerDbUrl -replace '\?.*$', ''

$readme = @"
Respaldo generado: $ts
===================

1) Base de datos completa: 01-database-full.dump
   Restaurar (ejemplo): pg_restore -d "postgresql://USER:PASS@HOST:5432/DB" --clean --if-exists 01-database-full.dump

2) Solo tablas de chat (estructura + datos): 02-chat-only.dump
   Tablas: chat_channels, chat_messages, chat_attachments

3) Solo datos de chat (SQL): 02-chat-only-data.sql

4) Código de aplicación: 03-aplicacion-src.zip
   Excluye: node_modules, dist, backups, .git
   No incluye apps\api\.env ni secretos; conserva .env.example.

Nota: archivos adjuntos del chat están en almacenamiento objeto (S3/MinIO) referenciados por storage_key;
  este respaldo cubre PostgreSQL y el código fuente, no los blobs remotos.

Conexión: el script quita ?schema=public de DATABASE_URL (Prisma) para compatibilidad con pg_dump.
"@
Set-Content -Path (Join-Path $out 'README.txt') -Value $readme -Encoding UTF8

Write-Host "Salida: $out"
Write-Host "Descargando imagen postgres:17-alpine si hace falta..."
docker pull postgres:17-alpine | Out-Null

Write-Host "01 - Volcado BD completo..."
docker run --rm `
  -e "PGDUMPURL=$pgDumpUrl" `
  -v "${out}:/backup" `
  postgres:17-alpine `
  sh -c 'pg_dump "$PGDUMPURL" -Fc --no-owner -f /backup/01-database-full.dump'

Write-Host "02 - Volcado solo chat (custom)..."
docker run --rm `
  -e "PGDUMPURL=$pgDumpUrl" `
  -v "${out}:/backup" `
  postgres:17-alpine `
  sh -c 'pg_dump "$PGDUMPURL" -Fc --no-owner -f /backup/02-chat-only.dump -t chat_channels -t chat_messages -t chat_attachments'

Write-Host "02b - Volcado solo chat (SQL datos)..."
docker run --rm `
  -e "PGDUMPURL=$pgDumpUrl" `
  -v "${out}:/backup" `
  postgres:17-alpine `
  sh -c 'pg_dump "$PGDUMPURL" --data-only --inserts --no-owner -t chat_channels -t chat_messages -t chat_attachments -f /backup/02-chat-only-data.sql'

Write-Host "03 - ZIP código aplicación..."
Push-Location $RepoRoot
try {
  $zipPath = Join-Path $out '03-aplicacion-src.zip'
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  $toZip = @('apps')
  if (Test-Path (Join-Path $RepoRoot 'DOCUMENTACION_PROYECTO.md')) { $toZip += 'DOCUMENTACION_PROYECTO.md' }
  if (Test-Path (Join-Path $RepoRoot '.env.example')) { $toZip += '.env.example' }
  if (Test-Path (Join-Path $RepoRoot '.env.easypanel.example')) { $toZip += '.env.easypanel.example' }
  if (Test-Path (Join-Path $RepoRoot 'scripts')) { $toZip += 'scripts' }
  & tar.exe -a -cf $zipPath `
    --exclude=node_modules `
    --exclude=dist `
    --exclude=backups `
    --exclude=.git `
    @toZip
} finally {
  Pop-Location
}

Get-ChildItem $out | Format-Table Name, Length -AutoSize
Write-Host "Listo."
