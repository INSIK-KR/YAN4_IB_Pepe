@echo off
chcp 65001 >nul
setlocal
set "ROOT=%~dp0"
set "APP=%ROOT%YAN4-SlaTeamsApp"

where dotnet >nul 2>&1
if errorlevel 1 (
  echo [오류] .NET SDK 없음 — https://dotnet.microsoft.com/download
  pause
  exit /b 1
)

echo [빌드] YAN4-SlaTeams.exe ^(단일 파일, PS1 내장^)
dotnet publish "%APP%\YAN4-SlaTeamsApp.csproj" -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true
if errorlevel 1 (
  echo [오류] 빌드 실패
  pause
  exit /b 1
)

set "OUT=%APP%\bin\Release\net8.0-windows\win-x64\publish"
echo.
echo [OK] 이 파일만 복사하면 됩니다:
echo   %OUT%\YAN4-SlaTeams.exe
echo.
explorer "%OUT%"
pause
