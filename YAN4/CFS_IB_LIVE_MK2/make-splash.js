"use strict";

/**
 * 로딩 그림 원본은 build/splash-source.png (완성 이미지).
 * build/splash-source-2.png 가 있으면 renderer/splash-full-2.png 도 만듦
 * (앱 로딩 창은 두 장 중 랜덤, 포터블 압축 해제 BMP 는 1번만).
 * 가로·세로 50%로 줄이고 비율은 유지한 채
 *  - build/splash.bmp          (포터블 압축 해제 중, 실제 BMP)
 *  - renderer/splash-full.png  (앱 시작 로딩 창)
 * 만 다시 씁니다. splash-source.png 는 덮어쓰지 않습니다.
 * 원본이 없을 때만 splash-logo 로 480×300 기본 화면을 만듭니다.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = __dirname;
const pkg = require("./package.json");
const title = (pkg.build && pkg.build.productName) || "CFS IB LIVE";
const bmpOut = path.join(root, "build", "splash.bmp");
const pngOut = path.join(root, "renderer", "splash-full.png");
const source = path.join(root, "build", "splash-source.png");
const source2 = path.join(root, "build", "splash-source-2.png");
const pngOut2 = path.join(root, "renderer", "splash-full-2.png");

function psq(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function runPs(ps) {
  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(ps, "utf16le").toString("base64")],
    { stdio: ["ignore", "inherit", "inherit"], timeout: 60000 }
  );
  if (r.status !== 0) {
    console.error("[make-splash] 실패 (exit " + r.status + ")");
    process.exit(r.status || 1);
  }
}

function halfSizeScript(srcPath, outs) {
  return [
    "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'",
    "Add-Type -AssemblyName System.Drawing",
    "$img=[System.Drawing.Image]::FromFile(" + psq(srcPath) + ")",
    "$w=[int][Math]::Max(1, [Math]::Round($img.Width * 0.5))",
    "$h=[int][Math]::Max(1, [Math]::Round($img.Height * 0.5))",
    "$bmp=New-Object System.Drawing.Bitmap $w,$h,([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)",
    "$bmp.SetResolution(96,96)",
    "$g=[System.Drawing.Graphics]::FromImage($bmp)",
    "$g.InterpolationMode='HighQualityBicubic'",
    "$g.PixelOffsetMode='HighQuality'",
    "$g.DrawImage($img, 0, 0, $w, $h)",
    "$g.Dispose()",
  ]
    .concat(
      outs.map(function (o) {
        return "$bmp.Save(" + psq(o.path) + ",[System.Drawing.Imaging.ImageFormat]::" + o.fmt + ")";
      })
    )
    .concat(["$bmp.Dispose()", "$img.Dispose()", "Write-Output ($w.ToString() + 'x' + $h.ToString())"])
    .join("\n");
}

if (fs.existsSync(source)) {
  runPs(
    halfSizeScript(source, [
      { path: bmpOut, fmt: "Bmp" },
      { path: pngOut, fmt: "Png" },
    ])
  );
  console.log("[make-splash] splash-source.png → splash.bmp, renderer/splash-full.png (50%)");
  if (fs.existsSync(source2)) {
    runPs(halfSizeScript(source2, [{ path: pngOut2, fmt: "Png" }]));
    console.log("[make-splash] splash-source-2.png → renderer/splash-full-2.png (50%)");
  } else if (fs.existsSync(pngOut2)) {
    fs.unlinkSync(pngOut2);
  }
  process.exit(0);
}

const candidates = ["splash-logo.png", "splash-logo.jpg", "splash-logo.jpeg", "icon.png"];
let src = "";
for (const name of candidates) {
  const p = path.join(root, "build", name);
  if (fs.existsSync(p)) {
    src = p;
    break;
  }
}
if (!src) {
  console.warn("[make-splash] 이미지 없음 — 생략");
  process.exit(0);
}

const ps = [
  "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'",
  "Add-Type -AssemblyName System.Drawing",
  "$src=" + psq(src),
  "$W=480; $H=300; $boxW=300; $boxH=120",
  "$logo=[System.Drawing.Image]::FromFile($src)",
  "$s=[Math]::Min($boxW/$logo.Width, $boxH/$logo.Height)",
  "$lw=[int]($logo.Width*$s); $lh=[int]($logo.Height*$s)",
  "$bmp=New-Object System.Drawing.Bitmap $W,$H,([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)",
  "$bmp.SetResolution(96,96)",
  "$g=[System.Drawing.Graphics]::FromImage($bmp)",
  "$g.SmoothingMode='AntiAlias'; $g.InterpolationMode='HighQualityBicubic'; $g.TextRenderingHint='AntiAliasGridFit'",
  "$g.Clear([System.Drawing.Color]::FromArgb(15,23,42))",
  "$g.DrawImage($logo, [int](($W-$lw)/2), [int](26+($boxH-$lh)/2), $lw, $lh)",
  "$sf=New-Object System.Drawing.StringFormat; $sf.Alignment='Center'",
  "$f1=New-Object System.Drawing.Font('Malgun Gothic',18,[System.Drawing.FontStyle]::Bold)",
  "$f2=New-Object System.Drawing.Font('Malgun Gothic',10.5)",
  "$g.DrawString(" + psq(title) + ",$f1,(New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(251,191,36))),(New-Object System.Drawing.RectangleF 0,160,$W,34),$sf)",
  "$g.DrawString(" + psq("프로그램 준비 중입니다… 잠시만 기다려 주세요") + ",$f2,(New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(203,213,225))),(New-Object System.Drawing.RectangleF 0,204,$W,24),$sf)",
  "$g.DrawString(" + psq("여러 번 실행하지 마세요") + ",$f2,(New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(148,163,184))),(New-Object System.Drawing.RectangleF 0,230,$W,24),$sf)",
  "$g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(30,41,59))), 110, 266, 260, 6)",
  "$g.Dispose()",
  "$bmp.Save(" + psq(bmpOut) + ",[System.Drawing.Imaging.ImageFormat]::Bmp)",
  "$bmp.Save(" + psq(pngOut) + ",[System.Drawing.Imaging.ImageFormat]::Png)",
  "$bmp.Dispose()",
  "$logo.Dispose()",
].join("\n");
runPs(ps);
console.log("[make-splash]", path.basename(src), "→ splash.bmp, renderer/splash-full.png");
