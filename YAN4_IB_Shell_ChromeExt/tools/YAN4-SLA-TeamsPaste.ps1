# YAN4 SLA — Inbox 최신 batch(teams.json) → Teams 채팅 텍스트+PNG 순서 입력
# 실행: powershell -STA -ExecutionPolicy Bypass -File "...\YAN4-SLA-TeamsPaste.ps1"
function Get-SlaDownloadsPath {
    try {
        $reg = Get-ItemProperty -LiteralPath `
            'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders' `
            -ErrorAction Stop
        $raw = $reg.'{374DE290-123F-4565-9164-39C92E26B867}'
        if ($raw) {
            $expanded = [Environment]::ExpandEnvironmentVariables([string]$raw)
            if ($expanded -and (Test-Path -LiteralPath $expanded)) {
                return $expanded
            }
        }
    } catch {}
    $fallback = Join-Path $env:USERPROFILE 'Downloads'
    if (Test-Path -LiteralPath $fallback) { return $fallback }
    $oneDrive = Join-Path $env:USERPROFILE 'OneDrive\Downloads'
    if (Test-Path -LiteralPath $oneDrive) { return $oneDrive }
    return $fallback
}

$Downloads = Get-SlaDownloadsPath
$InboxPath = Join-Path $Downloads 'Inbox'
$StateFile = Join-Path $InboxPath '.last-posted.txt'
$LogFile = Join-Path $Downloads 'sla-teams-paste.log'
$script:SlaWin32Loaded = $false

function Write-SlaLog {
    param(
        [string]$Level,
        [string]$Message
    )
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$ts] [$Level] $Message"
    try {
        $logDir = Split-Path -LiteralPath $LogFile -Parent
        if (-not (Test-Path -LiteralPath $logDir)) {
            New-Item -ItemType Directory -Path $logDir -Force | Out-Null
        }
        Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
    } catch {}
    Write-Host $line
}

function Initialize-SlaWin32 {
    if ($script:SlaWin32Loaded) { return }
    Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class SlaWin32 {
    public static IntPtr Found = IntPtr.Zero;
    public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr ProcessId);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
    public static string GetTitle(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero) return "";
        int len = GetWindowTextLength(hWnd);
        if (len <= 0) return "";
        var sb = new StringBuilder(len + 1);
        GetWindowText(hWnd, sb, sb.Capacity);
        return sb.ToString();
    }
    public static bool TitleLooksLikeTeams(string t) {
        if (string.IsNullOrEmpty(t)) return false;
        return t.IndexOf("Teams", StringComparison.OrdinalIgnoreCase) >= 0
            || t.IndexOf("Microsoft Teams", StringComparison.OrdinalIgnoreCase) >= 0;
    }
    public static bool EnumCallback(IntPtr hWnd, IntPtr lParam) {
        if (!IsWindowVisible(hWnd)) return true;
        string t = GetTitle(hWnd);
        if (TitleLooksLikeTeams(t)) {
            Found = hWnd;
            return false;
        }
        return true;
    }
    public static bool ForceForeground(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero) return false;
        ShowWindow(hWnd, 9);
        IntPtr fg = GetForegroundWindow();
        uint fgThread = GetWindowThreadProcessId(fg, IntPtr.Zero);
        uint curThread = GetCurrentThreadId();
        uint targetThread = GetWindowThreadProcessId(hWnd, IntPtr.Zero);
        if (fgThread != 0 && fgThread != curThread) AttachThreadInput(curThread, fgThread, true);
        if (targetThread != 0 && targetThread != curThread) AttachThreadInput(curThread, targetThread, true);
        SetForegroundWindow(hWnd);
        if (targetThread != 0 && targetThread != curThread) AttachThreadInput(curThread, targetThread, false);
        if (fgThread != 0 && fgThread != curThread) AttachThreadInput(curThread, fgThread, false);
        return GetForegroundWindow() == hWnd;
    }
}
"@
    $script:SlaWin32Loaded = $true
}

function Minimize-OwnConsole {
    Initialize-SlaWin32
    $hwnd = [SlaWin32]::GetConsoleWindow()
    if ($hwnd -ne [IntPtr]::Zero) {
        [void][SlaWin32]::ShowWindow($hwnd, 6)
    }
}

function Test-TeamsIsForeground {
    Initialize-SlaWin32
    $title = [SlaWin32]::GetTitle([SlaWin32]::GetForegroundWindow())
    return [SlaWin32]::TitleLooksLikeTeams($title)
}

function Get-TeamsWindowHandles {
    Initialize-SlaWin32
    $handles = New-Object System.Collections.Generic.List[IntPtr]
    $seen = @{}

    foreach ($name in @('ms-teams', 'Teams')) {
        Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object {
            $h = $_.MainWindowHandle
            if ($h -ne 0 -and -not $seen.ContainsKey($h)) {
                $seen[$h] = $true
                [void]$handles.Add($h)
            }
        }
    }

    [SlaWin32]::Found = [IntPtr]::Zero
    [void][SlaWin32]::EnumWindows([SlaWin32+EnumProc] { param($h, $l) [SlaWin32]::EnumCallback($h, $l) }, [IntPtr]::Zero)
    if ([SlaWin32]::Found -ne [IntPtr]::Zero -and -not $seen.ContainsKey([SlaWin32]::Found)) {
        [void]$handles.Add([SlaWin32]::Found)
    }

    return @($handles)
}

function Focus-TeamsChatWindow {
    param([int]$MaxAttempts = 6)

    Minimize-OwnConsole
    Start-Sleep -Milliseconds 350

    $handles = Get-TeamsWindowHandles
    if (-not $handles.Count) {
        return $null
    }

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        foreach ($hwnd in $handles) {
            [void][SlaWin32]::ForceForeground($hwnd)
            Start-Sleep -Milliseconds 450
            if (Test-TeamsIsForeground) {
                return "foreground verified (attempt $attempt)"
            }
        }

        try {
            $shell = New-Object -ComObject WScript.Shell
            foreach ($title in @('Microsoft Teams', 'Teams')) {
                if ($shell.AppActivate($title)) {
                    Start-Sleep -Milliseconds 450
                    if (Test-TeamsIsForeground) {
                        return "AppActivate $title (attempt $attempt)"
                    }
                }
            }
        } catch {}

        Start-Sleep -Milliseconds 350
    }

    return $null
}

function Ensure-TeamsFocus {
    if (Test-TeamsIsForeground) { return $true }
    $focus = Focus-TeamsChatWindow -MaxAttempts 3
    return [bool]$focus
}

function Send-TeamsNewLine {
    if (-not (Ensure-TeamsFocus)) {
        throw 'Teams foreground lost before newline'
    }
    [System.Windows.Forms.SendKeys]::SendWait('+{ENTER}')
    Start-Sleep -Milliseconds 250
}

function Send-TeamsBlankLine {
    Send-TeamsNewLine
}

function Send-TeamsTextLine {
    param([string]$Text)
    if (-not (Ensure-TeamsFocus)) {
        throw 'Teams foreground lost before text paste'
    }
    [System.Windows.Forms.Clipboard]::SetText([string]$Text)
    Start-Sleep -Milliseconds 200
    [System.Windows.Forms.SendKeys]::SendWait('^v')
    Start-Sleep -Milliseconds 350
    Send-TeamsNewLine
}

function Send-TeamsImage {
    param([string]$ImagePath)
    if (-not (Ensure-TeamsFocus)) {
        throw 'Teams foreground lost before image paste'
    }
    $img = [System.Drawing.Image]::FromFile($ImagePath)
    [System.Windows.Forms.Clipboard]::SetImage($img)
    $img.Dispose()
    Start-Sleep -Milliseconds 250
    if (-not [System.Windows.Forms.Clipboard]::ContainsImage()) {
        throw "clipboard has no image: $ImagePath"
    }
    [System.Windows.Forms.SendKeys]::SendWait('^v')
    Start-Sleep -Milliseconds 700
    Send-TeamsNewLine
}

function Test-SlaBatchReady {
    param(
        [object]$Manifest,
        [string]$Inbox
    )
    foreach ($sec in $Manifest.sections) {
        $p = Join-Path $Inbox ([string]$sec.file)
        if (-not (Test-Path -LiteralPath $p)) {
            return $false
        }
    }
    return $true
}

Write-SlaLog 'START' "run begin | downloads=$Downloads | inbox=$InboxPath"

try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    if (-not (Test-Path -LiteralPath $InboxPath)) {
        Write-SlaLog 'SKIP' "inbox folder not found: $InboxPath"
        exit 0
    }

    $manifestFiles = @(Get-ChildItem -LiteralPath $InboxPath -File -Filter 'sla-*.teams.json' |
        Sort-Object LastWriteTime -Descending)

    if (-not $manifestFiles.Count) {
        Write-SlaLog 'SKIP' 'teams.json none in inbox'
        exit 0
    }

    $manifest = $null
    foreach ($mf in $manifestFiles) {
        try {
            $candidate = Get-Content -LiteralPath $mf.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
        } catch {
            Write-SlaLog 'WARN' "bad json: $($mf.Name)"
            continue
        }
        if (-not $candidate -or -not $candidate.batchId -or -not $candidate.sections) {
            Write-SlaLog 'WARN' "invalid manifest: $($mf.Name)"
            continue
        }
        if (Test-SlaBatchReady -Manifest $candidate -Inbox $InboxPath) {
            $manifest = $candidate
            break
        }
        Write-SlaLog 'WARN' "manifest not ready (png missing): $($mf.Name)"
    }

    if (-not $manifest) {
        Write-SlaLog 'SKIP' 'ready teams.json batch none'
        exit 0
    }

    $batchKey = [string]$manifest.batchId
    if ((Test-Path -LiteralPath $StateFile) -and ((Get-Content -LiteralPath $StateFile -Raw).Trim() -eq $batchKey)) {
        Write-SlaLog 'SKIP' "already sent: $batchKey (재전송: Inbox\.last-posted.txt 삭제)"
        exit 0
    }

    Write-SlaLog 'INFO' "target batch: $batchKey | sections=$($manifest.sections.Count)"

    $focus = Focus-TeamsChatWindow
    if (-not $focus) {
        Write-SlaLog 'SKIP' 'Teams foreground failed — 그룹 채팅 입력칸 클릭 후 재시도 (전송 기록 없음)'
        exit 0
    }
    Write-SlaLog 'INFO' "Teams focused: $focus"

    Start-Sleep -Seconds 1

    Send-TeamsTextLine ([string]$manifest.header)
    Send-TeamsBlankLine

    foreach ($sec in $manifest.sections) {
        $label = [string]$sec.label
        $imgPath = Join-Path $InboxPath ([string]$sec.file)
        Write-SlaLog 'INFO' "paste section: $label -> $([string]$sec.file)"
        Send-TeamsTextLine $label
        Send-TeamsImage $imgPath
        Send-TeamsBlankLine
    }

    if ($manifest.metricsLines -and $manifest.metricsLines.Count -gt 0) {
        foreach ($mLine in $manifest.metricsLines) {
            $ml = [string]$mLine
            if ($ml.Trim()) {
                Send-TeamsTextLine $ml
            }
        }
    }

    if ($manifest.shrinkLines -and $manifest.shrinkLines.Count -gt 0) {
        Send-TeamsBlankLine
        foreach ($sLine in $manifest.shrinkLines) {
            $sl = [string]$sLine
            if ($sl.Trim()) {
                Send-TeamsTextLine $sl
            }
        }
    }

    if (-not (Ensure-TeamsFocus)) {
        throw 'Teams foreground lost before send'
    }
    Start-Sleep -Milliseconds 400
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')

    Set-Content -LiteralPath $StateFile -Value $batchKey -Encoding UTF8
    Write-SlaLog 'OK' "sent to Teams: $batchKey"
    exit 0
} catch {
    Write-SlaLog 'ERROR' $_.Exception.Message
    exit 1
}
