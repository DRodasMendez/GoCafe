@echo off
setlocal
title GoCafe - Iniciar sistema
rem Inicia todo el sistema: base de datos (Docker), backend y frontend, cada uno en su ventana.
rem Para apagar el sistema, cierra las ventanas "GoCafe - Backend" y "GoCafe - Frontend".

set "PROYECTO=%~dp0"
cd /d "%PROYECTO%"

echo.
echo  ===============================================
echo           GoCafe - Iniciando el sistema
echo  ===============================================
echo.

rem ---------- 1. Docker Desktop (base de datos) ----------
docker info >nul 2>&1
if not errorlevel 1 goto docker_listo

echo  [1/4] Abriendo Docker Desktop...
if exist "%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe" (
  start "" "%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe"
) else if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
  start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
) else (
  echo.
  echo  No encontre Docker Desktop. Abrelo manualmente y vuelve a ejecutar este archivo.
  goto fin_error
)

set /a intentos=0
:esperar_docker
timeout /t 3 /nobreak >nul
docker info >nul 2>&1
if not errorlevel 1 goto docker_listo
set /a intentos+=1
if %intentos% lss 60 goto esperar_docker
echo.
echo  Docker no respondio despues de 3 minutos. Revisa Docker Desktop y vuelve a intentar.
goto fin_error

:docker_listo
echo  [1/4] Docker listo.

rem ---------- 2. Base de datos ----------
echo  [2/4] Encendiendo la base de datos...
docker compose up -d >nul 2>&1
if errorlevel 1 (
  echo.
  echo  No se pudo encender la base de datos ^(docker compose up^).
  goto fin_error
)
set /a intentos=0
:esperar_db
docker exec gocafe-db-1 pg_isready -U gocafe >nul 2>&1
if not errorlevel 1 goto db_lista
set /a intentos+=1
if %intentos% geq 30 (
  echo.
  echo  La base de datos no respondio a tiempo.
  goto fin_error
)
timeout /t 1 /nobreak >nul
goto esperar_db
:db_lista
echo  [2/4] Base de datos lista.

rem ---------- 3. Backend (puerto 4000) ----------
netstat -ano | findstr /r /c:":4000 .*LISTENING" >nul
if not errorlevel 1 (
  echo  [3/4] El backend ya estaba corriendo.
) else (
  echo  [3/4] Iniciando el backend...
  start "GoCafe - Backend (no cerrar)" /d "%PROYECTO%backend" cmd /k npm run dev
)

rem ---------- 4. Frontend (puerto 5173) ----------
netstat -ano | findstr /r /c:":5173 .*LISTENING" >nul
if not errorlevel 1 (
  echo  [4/4] El frontend ya estaba corriendo.
) else (
  echo  [4/4] Iniciando el frontend...
  start "GoCafe - Frontend (no cerrar)" /d "%PROYECTO%frontend" cmd /k npm run dev
)

rem Espera a que el sistema responda (hasta ~60 s) antes de abrir el navegador.
set /a intentos=0
:esperar_web
curl -s -o nul -m 2 http://localhost:4000/health && curl -s -o nul -m 2 http://localhost:5173/ && goto web_lista
set /a intentos+=1
if %intentos% geq 30 goto web_lenta
timeout /t 2 /nobreak >nul
goto esperar_web

:web_lenta
echo.
echo  El sistema esta tardando en arrancar. Revisa las ventanas de Backend y Frontend por errores.
goto mostrar_direcciones

:web_lista
start "" http://localhost:5173

:mostrar_direcciones
set "IP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1).IPv4Address.IPAddress"`) do set "IP=%%i"

echo.
echo  ===============================================
echo   GoCafe esta encendido
echo  ===============================================
echo.
echo   En esta computadora:   http://localhost:5173
if defined IP (
  echo   En la tablet/celular:  http://%IP%:5173
  echo   ^(conectados al mismo Wi-Fi^)
)
echo.
echo   Para APAGAR el sistema, cierra las ventanas
echo   "GoCafe - Backend" y "GoCafe - Frontend".
echo.
pause
exit /b 0

:fin_error
echo.
pause
exit /b 1
