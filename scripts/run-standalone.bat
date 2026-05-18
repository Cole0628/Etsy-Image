@echo off
setlocal
cd /d "%~dp0..\dist-standalone"
if not exist "server.js" (
  echo 未找到 dist-standalone\server.js。请在项目根目录执行:
  echo   npm run build
  echo   npm run desktop:prepare
  pause
  exit /b 1
)
set "PORT=38477"
set "KIE_WORKBENCH_DATA_DIR=%APPDATA%\KieWorkbench"
if not exist "%KIE_WORKBENCH_DATA_DIR%" mkdir "%KIE_WORKBENCH_DATA_DIR%"
start "" "http://127.0.0.1:%PORT%"
echo 浏览器将打开 http://127.0.0.1:%PORT% ，关闭本窗口即停止服务。
"%CD%\node.exe" server.js
pause
