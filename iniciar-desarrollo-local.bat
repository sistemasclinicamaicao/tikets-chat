@echo off
REM Atajo al lanzador principal (misma logica que INICIAR-LOCAL.bat).
cd /d "%~dp0"
call "%~dp0INICIAR-LOCAL.bat" %*
