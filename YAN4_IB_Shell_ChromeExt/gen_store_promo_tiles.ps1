# Chrome Web Store promo tiles — exact canvas, 24bpp RGB PNG (no alpha)
Add-Type -AssemblyName System.Drawing

function New-RgbBitmap {
  param([int]$W, [int]$H)
  return New-Object System.Drawing.Bitmap $W, $H, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
}

function Draw-GradientBackground {
  param(
    [System.Drawing.Graphics]$G,
    [int]$W,
    [int]$H
  )
  $r = New-Object System.Drawing.Rectangle 0, 0, $W, $H
  $cTop = [System.Drawing.Color]::FromArgb(255, 239, 246, 255)
  $cMid = [System.Drawing.Color]::FromArgb(255, 219, 234, 254)
  $cBot = [System.Drawing.Color]::FromArgb(255, 191, 219, 254)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $r, $cTop, $cBot, 90.0
  $G.FillRectangle($brush, 0, 0, $W, $H)
  $brush.Dispose()
}

function Draw-IbTile {
  param(
    [System.Drawing.Graphics]$G,
    [float]$X,
    [float]$Y,
    [float]$Side
  )
  $pad = $Side * 0.08
  $rx = $Side * 0.22
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($X + $pad, $Y + $pad, $rx, $rx, 180, 90)
  $path.AddArc($X + $Side - $pad - $rx, $Y + $pad, $rx, $rx, 270, 90)
  $path.AddArc($X + $Side - $pad - $rx, $Y + $Side - $pad - $rx, $rx, $rx, 0, 90)
  $path.AddArc($X + $pad, $Y + $Side - $pad - $rx, $rx, $rx, 90, 90)
  $path.CloseFigure()
  $r = $path.GetBounds()
  $gb = New-Object System.Drawing.Drawing2D.LinearGradientBrush $r, `
    ([System.Drawing.Color]::FromArgb(255, 96, 165, 250)), `
    ([System.Drawing.Color]::FromArgb(255, 29, 78, 216)), 135.0
  $G.FillPath($gb, $path)
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 255, 255, 255)), ([Math]::Max(1.0, $Side / 64.0))
  $G.DrawPath($pen, $path)
  $gb.Dispose()
  $pen.Dispose()
  $fontPx = [Math]::Max(10.0, $Side * 0.36)
  $bold = [System.Drawing.FontStyle]::Bold
  $unit = [System.Drawing.GraphicsUnit]::Pixel
  $font = New-Object System.Drawing.Font "Arial", $fontPx, $bold, $unit
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $layout = New-Object System.Drawing.RectangleF $X, ($Y + $Side * 0.02), $Side, $Side
  $G.DrawString("IB", $font, [System.Drawing.Brushes]::White, $layout, $sf)
  $font.Dispose()
  $sf.Dispose()
  $path.Dispose()
}

function Save-PngRgb {
  param(
    [System.Drawing.Bitmap]$Bmp,
    [string]$Path
  )
  $Bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Save-JpegQuality {
  param(
    [System.Drawing.Bitmap]$Bmp,
    [string]$Path,
    [int]$Quality = 92
  )
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" } | Select-Object -First 1
  if (-not $codec) { Write-Warning "JPEG encoder missing"; return }
  $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
  $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$Quality)
  $Bmp.Save($Path, $codec, $ep)
  $ep.Dispose()
}

$outDir = "c:\Users\qkdrn\Documents\YAN4_IB_Pepe\YAN4_IB_Shell_ChromeExt"
$fsBold = [System.Drawing.FontStyle]::Bold
$fsRegular = [System.Drawing.FontStyle]::Regular
$gdu = [System.Drawing.GraphicsUnit]::Pixel

# --- Small promo 440 x 280 ---
$w1 = 440
$h1 = 280
$b1 = New-RgbBitmap $w1 $h1
$g1 = [System.Drawing.Graphics]::FromImage($b1)
$g1.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g1.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
Draw-GradientBackground $g1 $w1 $h1
$tile1 = 108.0
Draw-IbTile $g1 28.0 (($h1 - $tile1) / 2.0) $tile1
$titleFont = New-Object System.Drawing.Font "Segoe UI", 20.0, $fsBold, $gdu
$subFont   = New-Object System.Drawing.Font "Segoe UI", 11.0, $fsRegular, $gdu
$brushTitle = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
$brushSub   = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 71, 85, 105))
$g1.DrawString("YAN4 IB Unified Shell", $titleFont, $brushTitle, 156.0, 88.0)
$g1.DrawString("Inbound / Inventory / Outbound panel", $subFont, $brushSub, 156.0, 128.0)
$g1.DrawString("Chrome extension (Coupang WMS pages)", $subFont, $brushSub, 156.0, 152.0)
$titleFont.Dispose(); $subFont.Dispose(); $brushTitle.Dispose(); $brushSub.Dispose()
$g1.Dispose()
$p1 = Join-Path $outDir "promo_tile_small_440x280.png"
Save-PngRgb $b1 $p1
$j1 = Join-Path $outDir "promo_tile_small_440x280.jpg"
Save-JpegQuality $b1 $j1 92
$b1.Dispose()
Write-Host "Saved $p1"
Write-Host "Saved $j1"

# --- Marquee 1400 x 560 ---
$w2 = 1400
$h2 = 560
$b2 = New-RgbBitmap $w2 $h2
$g2 = [System.Drawing.Graphics]::FromImage($b2)
$g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g2.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
Draw-GradientBackground $g2 $w2 $h2
$tile2 = 220.0
Draw-IbTile $g2 72.0 (($h2 - $tile2) / 2.0) $tile2
$tMarq = New-Object System.Drawing.Font "Segoe UI", 44.0, $fsBold, $gdu
$sMarq = New-Object System.Drawing.Font "Segoe UI", 20.0, $fsRegular, $gdu
$lMarq = New-Object System.Drawing.Font "Segoe UI", 17.0, $fsRegular, $gdu
$brushTitle2 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
$brushSub2   = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 71, 85, 105))
$g2.DrawString("YAN4 IB Unified Shell", $tMarq, $brushTitle2, 340.0, 168.0)
$g2.DrawString("Unified panel on Coupang inbound, inventory, and outbound pages.", $sMarq, $brushSub2, 340.0, 248.0)
$g2.DrawString("PO / inspect / SLA / workflow helpers - runs in the browser as a Chrome extension.", $lMarq, $brushSub2, 340.0, 298.0)
$tMarq.Dispose(); $sMarq.Dispose(); $lMarq.Dispose(); $brushTitle2.Dispose(); $brushSub2.Dispose()
$g2.Dispose()
$p2 = Join-Path $outDir "promo_tile_marquee_1400x560.png"
Save-PngRgb $b2 $p2
$j2 = Join-Path $outDir "promo_tile_marquee_1400x560.jpg"
Save-JpegQuality $b2 $j2 92
$b2.Dispose()
Write-Host "Saved $p2"
Write-Host "Saved $j2"
