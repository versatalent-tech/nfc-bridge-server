@echo off
REM Generate self-signed SSL certificates for NFC Bridge Server
REM This enables secure WebSocket (WSS) connections from HTTPS websites

echo.
echo === NFC Bridge Server - SSL Certificate Generator ===
echo.

set SCRIPT_DIR=%~dp0
set CERTS_DIR=%SCRIPT_DIR%..\certs

if not exist "%CERTS_DIR%" mkdir "%CERTS_DIR%"

echo Output directory: %CERTS_DIR%
echo.

REM Check if mkcert is available
where mkcert >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Using mkcert for certificate generation...
    mkcert -install
    cd /d "%CERTS_DIR%"
    mkcert -key-file localhost-key.pem -cert-file localhost.pem localhost 127.0.0.1 ::1
    echo.
    echo Certificates generated with mkcert!
) else (
    echo mkcert not found. Please install it:
    echo   choco install mkcert
    echo   or download from https://github.com/FiloSottile/mkcert/releases
    echo.
    echo Alternatively, use openssl if available.
    pause
    exit /b 1
)

echo.
echo Certificate files generated in: %CERTS_DIR%
dir "%CERTS_DIR%\*.pem"
echo.
echo Done! The NFC Bridge Server will automatically use these certificates.
echo.
pause
