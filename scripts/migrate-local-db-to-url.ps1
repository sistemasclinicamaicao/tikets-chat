#Requires -Version 5.1
<#
  Migra la BD local (DATABASE_URL en apps\api\.env) hacia otra instancia PostgreSQL.

  1) pg_dump en formato custom (-Fc) desde el host local (vía Docker + host.docker.internal si aplica).
  2) pg_restore con --clean --if-exists (BORRA y recrea objetos en el destino).

  Uso:
    .\scripts\migrate-local-db-to-url.ps1 -TargetUrl 'postgresql://user:pass@host:5432/dbname?sslmode=disable'

  Si el destino no es alcanzable desde tu PC (firewall / solo red interna), genera solo el dump:
    .\scripts\migrate-local-db-to-url.ps1 -TargetUrl '...' -DumpOnly

  Si la BD remota ya tiene tablas y pg_restore --clean falla por FKs, borra el esquema public y restaura limpio:
    .\scripts\migrate-local-db-to-url.ps1 -TargetUrl '...' -ResetPublicSchema
    (PELIGRO: elimina TODO lo que este en schema public en el destino.)

  Luego sube el .dump al servidor y ejecuta allí pg_restore contra localhost o la URL interna.
  Ver DEPLOY_EASYPANEL.md seccion 6 (502 dominio puerto 3030) y seccion 7 (migrar BD).
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$TargetUrl,

  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,

  [switch]$DumpOnly,

  [switch]$ResetPublicSchema
)

$ErrorActionPreference = 'Stop'

$envFile = Join-Path $RepoRoot 'apps\api\.env'
if (-not (Test-Path $envFile)) { throw "No existe $envFile" }

$dbUrl = $null
Get-Content $envFile -Encoding UTF8 | ForEach-Object {
  if ($_ -match '^\s*DATABASE_URL\s*=\s*(.+)\s*$') {
    $dbUrl = $matches[1].Trim().Trim('"').Trim("'")
  }
}
if ([string]::IsNullOrWhiteSpace($dbUrl)) { throw 'DATABASE_URL no encontrado en apps\api\.env' }

$src = $dbUrl `
  -replace '@localhost:', '@host.docker.internal:' `
  -replace '@127\.0\.0\.1:', '@host.docker.internal:' `
  -replace '\?.*$', ''

$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$dir = Join-Path $RepoRoot "backups\migrate-to-remote-$ts"
New-Item -ItemType Directory -Path $dir -Force | Out-Null
$dumpPath = Join-Path $dir 'local.dump'

Write-Host "Origen (local): apps\api\.env (normalizado para Docker)"
Write-Host "Dump: $dumpPath"

docker pull postgres:17-alpine | Out-Null

docker run --rm `
  -e "PGSRC=$src" `
  -v "${dir}:/backup" `
  postgres:17-alpine `
  sh -c 'pg_dump "$PGSRC" -Fc --no-owner -f /backup/local.dump'

if (-not (Test-Path $dumpPath)) { throw 'No se genero local.dump' }
Write-Host "OK pg_dump ($((Get-Item $dumpPath).Length) bytes)"

if ($DumpOnly) {
  Write-Host "DumpOnly: no se ejecuta pg_restore. Sube $dumpPath al servidor y restaura alli."
  exit 0
}

$dst = $TargetUrl.Trim().Trim('"').Trim("'")
if ($dst -match '^postgres://') { $dst = 'postgresql://' + $dst.Substring('postgres://'.Length) }

if ($ResetPublicSchema) {
  Write-Host "Destino: DROP SCHEMA public CASCADE + CREATE SCHEMA (irreversible en public)..."
  Copy-Item (Join-Path $PSScriptRoot 'reset-public-schema.sql') (Join-Path $dir 'reset-public-schema.sql') -Force
  docker run --rm `
    -e "PGDST=$dst" `
    -v "${dir}:/backup" `
    postgres:17-alpine `
    sh -c 'psql "$PGDST" -v ON_ERROR_STOP=1 -f /backup/reset-public-schema.sql'
  if ($LASTEXITCODE -ne 0) { throw 'psql DROP/CREATE schema fallo' }
  Write-Host "Destino: pg_restore (sin --clean; esquema vacio)..."
  docker run --rm `
    -e "PGDST=$dst" `
    -v "${dir}:/backup" `
    postgres:17-alpine `
    sh -c 'pg_restore --no-owner --no-acl -d "$PGDST" /backup/local.dump'
}
else {
  Write-Host "Destino: pg_restore --clean --if-exists ..."
  docker run --rm `
    -e "PGDST=$dst" `
    -v "${dir}:/backup" `
    postgres:17-alpine `
    sh -c 'pg_restore --clean --if-exists --no-owner --no-acl -d "$PGDST" /backup/local.dump'
}
if ($LASTEXITCODE -ne 0) { throw 'pg_restore fallo (revisa salida arriba)' }

Write-Host "Migracion completada. Copia de seguridad del dump en: $dir"
