@echo off
title YNA4 미니맵
cd /d "%~dp0"

if not exist "node_modules\" (
  echo [미니맵] node_modules 없음. npm install 실행 중...
  call npm install
  if errorlevel 1 (
    echo 설치 실패. Node.js / npm 설치 여부를 확인하세요.
    pause
    exit /b 1
  )
)

call npm start
if errorlevel 1 (
  echo 실행 중 오류가 있었습니다.
  pause
)
