Add-Type -AssemblyName System.Drawing

function Write-Yan4IbIconPng {
  param(
    [int]$Size,
    [float]$FontPx,
    [float]$LayoutPadTop,
    [string]$OutPath
  )
  $w = $Size
  $h = $Size
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAlias'
  $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
  $c1 = [System.Drawing.Color]::FromArgb(255, 13, 71, 161)
  $c2 = [System.Drawing.Color]::FromArgb(255, 25, 118, 210)
  $brush1 = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $c1, $c2, 45.0
  $g.FillRectangle($brush1, 0, 0, $w, $h)
  $bold = [System.Drawing.FontStyle]::Bold
  $unit = [System.Drawing.GraphicsUnit]::Pixel
  $font = New-Object System.Drawing.Font "Arial", $FontPx, $bold, $unit
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $layout = New-Object System.Drawing.RectangleF 0, $LayoutPadTop, $w, ($h - $LayoutPadTop)
  $g.DrawString("IB", $font, [System.Drawing.Brushes]::White, $layout, $sf)
  $font.Dispose()
  $sf.Dispose()
  $brush1.Dispose()
  $g.Dispose()
  $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "Saved $OutPath (${w}x${h})"
}

$base = "c:\Users\qkdrn\Documents\YAN4_IB_Pepe\YAN4_IB_Shell_ChromeExt"
Write-Yan4IbIconPng -Size 96  -FontPx 32 -LayoutPadTop 4 -OutPath (Join-Path $base "icon96.png")
Write-Yan4IbIconPng -Size 128 -FontPx 44 -LayoutPadTop 6 -OutPath (Join-Path $base "icon128.png")
