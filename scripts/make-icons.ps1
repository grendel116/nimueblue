# Builds NimueBlue's icon, Android adaptive icon, splash logo, header logo, and favicon
# directly from the vector paths in assets/images/nimue-blue-logo.svg.
param([string]$Root = "c:\LLM\Mirlo-Blue")
Add-Type -AssemblyName System.Drawing

$svgXml = [xml](Get-Content "$Root\assets\images\nimue-blue-logo.svg" -Raw)

function ConvertFrom-SvgPaths($paths) {
  $gp = New-Object System.Drawing.Drawing2D.GraphicsPath([System.Drawing.Drawing2D.FillMode]::Winding)
  $tokenRegex = [regex]'([MmCcLlZz])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)'

  foreach ($p in $paths) {
    $d = [string]$p.d
    $tokens = $tokenRegex.Matches($d)
    $i = 0
    $cmd = ""
    [float]$cx = 0
    [float]$cy = 0
    [float]$sx = 0
    [float]$sy = 0

    while ($i -lt $tokens.Count) {
      $val = $tokens[$i].Value
      if ($val -match '^[MmCcLlZz]$') {
        $cmd = $val
        $i++
        if ($cmd -eq 'Z' -or $cmd -eq 'z') {
          $gp.CloseFigure()
          $cx = $sx; $cy = $sy
        }
        continue
      }

      switch -Exact -CaseSensitive ($cmd) {
        'M' {
          $cx = [float]$tokens[$i].Value; $cy = [float]$tokens[$i+1].Value; $i += 2
          $sx = $cx; $sy = $cy
          $gp.StartFigure()
          $cmd = 'L'
        }
        'm' {
          $cx += [float]$tokens[$i].Value; $cy += [float]$tokens[$i+1].Value; $i += 2
          $sx = $cx; $sy = $cy
          $gp.StartFigure()
          $cmd = 'l'
        }
        'L' {
          $nx = [float]$tokens[$i].Value; $ny = [float]$tokens[$i+1].Value; $i += 2
          $gp.AddLine($cx, $cy, $nx, $ny)
          $cx = $nx; $cy = $ny
        }
        'l' {
          $nx = $cx + [float]$tokens[$i].Value; $ny = $cy + [float]$tokens[$i+1].Value; $i += 2
          $gp.AddLine($cx, $cy, $nx, $ny)
          $cx = $nx; $cy = $ny
        }
        'C' {
          $x1 = [float]$tokens[$i].Value;   $y1 = [float]$tokens[$i+1].Value
          $x2 = [float]$tokens[$i+2].Value; $y2 = [float]$tokens[$i+3].Value
          $nx = [float]$tokens[$i+4].Value; $ny = [float]$tokens[$i+5].Value
          $i += 6
          $gp.AddBezier($cx, $cy, $x1, $y1, $x2, $y2, $nx, $ny)
          $cx = $nx; $cy = $ny
        }
        'c' {
          $x1 = $cx + [float]$tokens[$i].Value;   $y1 = $cy + [float]$tokens[$i+1].Value
          $x2 = $cx + [float]$tokens[$i+2].Value; $y2 = $cy + [float]$tokens[$i+3].Value
          $nx = $cx + [float]$tokens[$i+4].Value; $ny = $cy + [float]$tokens[$i+5].Value
          $i += 6
          $gp.AddBezier($cx, $cy, $x1, $y1, $x2, $y2, $nx, $ny)
          $cx = $nx; $cy = $ny
        }
      }
    }
  }
  return $gp
}

$logoPath = ConvertFrom-SvgPaths $svgXml.svg.path
$bounds = $logoPath.GetBounds()
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#00d2ff"))

function New-Canvas([int]$size, [bool]$dark) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  if ($dark) {
    $g.Clear([System.Drawing.ColorTranslator]::FromHtml("#070b14"))
    # Soft cyan glow behind the logo
    $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowPath.AddEllipse([int]($size * 0.08), [int]($size * 0.08), [int]($size * 0.84), [int]($size * 0.84))
    $glow = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
    $glow.CenterColor = [System.Drawing.Color]::FromArgb(70, 0, 210, 255)
    $glow.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 0, 210, 255))
    $g.FillPath($glow, $glowPath)
    $glow.Dispose()
    $glowPath.Dispose()
  } else {
    $g.Clear([System.Drawing.Color]::Transparent)
  }
  return @($bmp, $g)
}

function Draw-Logo($g, [int]$size, [double]$scale) {
  $fit = [float]($size * $scale / [Math]::Max($bounds.Width, $bounds.Height))
  $cx = $bounds.X + ($bounds.Width / 2.0)
  $cy = $bounds.Y + ($bounds.Height / 2.0)

  $matrix = New-Object System.Drawing.Drawing2D.Matrix
  $matrix.Translate(($size / 2.0), ($size / 2.0))
  $matrix.Scale($fit, $fit)
  $matrix.Translate(-$cx, -$cy)

  $cloned = $logoPath.Clone()
  $cloned.Transform($matrix)
  $g.FillPath($brush, $cloned)
  $cloned.Dispose()
  $matrix.Dispose()
}

function Save-Png($pair, [string]$relPath) {
  $pair[1].Dispose()
  $fullPath = Join-Path $Root $relPath
  $pair[0].Save($fullPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $pair[0].Dispose()
  "wrote $relPath"
}

# App icon (iOS and fallback): full square, dark with glow
$c = New-Canvas 1024 $true; Draw-Logo $c[1] 1024 0.62; Save-Png $c "assets\images\nimue-blue-icon.png"
# Android adaptive foreground: transparent, logo inside the center safe zone
$c = New-Canvas 1024 $false; Draw-Logo $c[1] 1024 0.46; Save-Png $c "assets\images\nimue-blue-adaptive.png"
# Splash logo: transparent, padded so Android 12+'s circular crop keeps the whole mark
$c = New-Canvas 512 $false; Draw-Logo $c[1] 512 0.64; Save-Png $c "assets\images\nimue-blue-splash.png"
# In-app header & fallback logo mark: transparent, tight fit
$c = New-Canvas 512 $false; Draw-Logo $c[1] 512 0.90; Save-Png $c "assets\images\nimue-blue-logo.png"
# Web favicon
$c = New-Canvas 128 $false; Draw-Logo $c[1] 128 0.90; Save-Png $c "assets\images\favicon.png"
# Docs / web landing page logo
$c = New-Canvas 512 $false; Draw-Logo $c[1] 512 0.90; Save-Png $c "docs\logo.png"

$brush.Dispose()
$logoPath.Dispose()
