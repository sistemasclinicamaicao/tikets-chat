@echo off
REM ============================================================================
REM  Chat-Tikets — arranque local completo (doble clic o desde cmd)
REM  - Cierra procesos en :3030 (API) y :5173 (Web) si están ocupados
REM  - PostgreSQL (Docker, docker-compose.local-db.yml)
REM  - API NestJS  http://localhost:3030
REM  - Web Vite    http://localhost:5173/login
REM  Opciones:
REM    --sin-forzar   No cerrar puertos; reutilizar API/Web ya en ejecución
REM    --forzar       Alias de reinicio limpio (comportamiento por defecto)
REM    --sin-navegador  No abrir el navegador al final
REM ============================================================================
chcp 65001 >nul
title Chat-Tikets - Inicio local
setlocal EnableDelayedExpansion

cd /d "%~dp0"
set "REPO=%cd%"

echo.
echo  ============================================================
echo   Chat-Tikets - Iniciando aplicacion en local
echo   Carpeta: %REPO%
echo  ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js no esta en el PATH. Instale Node 20+ desde https://nodejs.org
    echo.
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] npm no encontrado. Reinstale Node.js.
    echo.
    pause
    exit /b 1
)

set "PS_ARGS="
:parse_args
if "%~1"=="" goto run_ps
if /i "%~1"=="--forzar" set "PS_ARGS=-ForzarPuertos" & shift & goto parse_args
if /i "%~1"=="-forzar" set "PS_ARGS=-ForzarPuertos" & shift & goto parse_args
if /i "%~1"=="--forzar-puertos" set "PS_ARGS=-ForzarPuertos" & shift & goto parse_args
if /i "%~1"=="--sin-forzar" set "PS_ARGS=-NoForzarPuertos" & shift & goto parse_args
if /i "%~1"=="-sin-forzar" set "PS_ARGS=-NoForzarPuertos" & shift & goto parse_args
if /i "%~1"=="--sin-navegador" set "PS_ARGS=%PS_ARGS% -SinNavegador" & shift & goto parse_args
if /i "%~1"=="-SinNavegador" set "PS_ARGS=%PS_ARGS% -SinNavegador" & shift & goto parse_args
shift
goto parse_args

:run_ps
powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO%\scripts\iniciar-desarrollo-local.ps1" %PS_ARGS%
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
    echo  Finalizado con errores (codigo %EXIT_CODE%).
) else (
    echo  Proceso de arranque finalizado. Las ventanas API y Web siguen abiertas.
    echo  Cierre esas ventanas cmd para detener los servicios.
)
echo.
pause
endlocal
exit /b %EXIT_CODE%
