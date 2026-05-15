@echo off
chcp 65001 >nul
setlocal

:: Carpeta que contiene este .bat debe ser la raíz del repo (donde esta docker-compose.local-db.yml)
cd /d "%~dp0"
set "REPO=%cd%"

echo ============================================
echo  Chat-Tikets - servidores locales
echo  Repo: %REPO%
echo ============================================
echo.

echo [1/3] PostgreSQL (Docker: docker-compose.local-db.yml^)...
docker compose -f "%REPO%\docker-compose.local-db.yml" up -d
if errorlevel 1 (
  echo [AVISO] No se pudo ejecutar compose. ¿Docker Desktop encendido? Si Postgres ya corre en :5432, puedes seguir.
  echo.
)

timeout /t 2 /nobreak >nul

echo [2/3] API Nest ^(npm run start:dev en apps\api — puerto 3030^)
start "chat-tickets API (3030)" cmd /k "cd /d ""%REPO%\apps\api"" && npm run start:dev"

timeout /t 2 /nobreak >nul

echo [3/3] Web Vite ^(npm run dev en apps\web — puerto 5173^)
start "chat-tickets Web (5173)" cmd /k "cd /d ""%REPO%\apps\web"" && npm run dev"

echo.
echo Abiertas dos ventanas: API y WEB. Postgres vía compose si Docker respondio bien.
echo  - Web: http://localhost:5173
echo  - API: http://localhost:3030/api/v1/docs
echo.
echo Requisitos: Node.js instalado y ^"npm install^" ya hecho en apps\api y apps\web.
echo.
pause
endlocal
