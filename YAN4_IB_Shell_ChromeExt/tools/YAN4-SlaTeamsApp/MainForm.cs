namespace YAN4.SlaTeams;

internal sealed class MainForm : Form
{
    private const int PasteIntervalSeconds = 180;

    private readonly Label _statusLabel = new();
    private readonly Label _countdownLabel = new();
    private readonly Label _pathLabel = new();
    private readonly TextBox _logBox = new();
    private readonly Button _pasteNowButton = new();
    private readonly System.Windows.Forms.Timer _countdownTimer = new();
    private readonly System.Windows.Forms.Timer _keepAwakeTimer = new();
    private int _secondsUntilNextPaste;
    private bool _cleanupDone;
    private bool _pasteRunning;

    public MainForm()
    {
        Text = "YAN4 SLA Teams";
        MinimumSize = new Size(720, 520);
        Size = new Size(860, 640);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(12, 18, 12);
        ForeColor = Color.FromArgb(180, 255, 180);
        Font = new Font("Malgun Gothic", 9F);

        _statusLabel.Dock = DockStyle.Top;
        _statusLabel.Height = 44;
        _statusLabel.Padding = new Padding(12, 10, 12, 0);
        _statusLabel.Text = "준비 중…";
        _statusLabel.ForeColor = Color.FromArgb(190, 255, 190);

        _pathLabel.Dock = DockStyle.Top;
        _pathLabel.Height = 72;
        _pathLabel.Padding = new Padding(12, 4, 12, 0);
        _pathLabel.ForeColor = Color.FromArgb(140, 220, 140);

        _pasteNowButton.Text = "지금 붙여넣기";
        _pasteNowButton.AutoSize = true;
        _pasteNowButton.Margin = new Padding(12, 8, 12, 8);
        _pasteNowButton.BackColor = Color.FromArgb(24, 48, 24);
        _pasteNowButton.ForeColor = Color.FromArgb(190, 255, 190);
        _pasteNowButton.FlatStyle = FlatStyle.Flat;
        _pasteNowButton.Click += async (_, _) => await RunPasteAsync("수동");

        _countdownLabel.AutoSize = true;
        _countdownLabel.Margin = new Padding(8, 10, 12, 8);
        _countdownLabel.Font = new Font("Malgun Gothic", 11F, FontStyle.Bold);
        _countdownLabel.ForeColor = Color.FromArgb(160, 255, 160);
        _countdownLabel.Text = "다음 붙여넣기: —";

        var topPanel = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 48,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            BackColor = BackColor
        };
        topPanel.Controls.Add(_pasteNowButton);
        topPanel.Controls.Add(_countdownLabel);

        _logBox.Dock = DockStyle.Fill;
        _logBox.Multiline = true;
        _logBox.ReadOnly = true;
        _logBox.ScrollBars = ScrollBars.Both;
        _logBox.WordWrap = false;
        _logBox.BackColor = Color.Black;
        _logBox.ForeColor = Color.FromArgb(120, 255, 120);
        _logBox.Font = new Font("Consolas", 9.5F);
        _logBox.BorderStyle = BorderStyle.FixedSingle;

        var hint = new Label
        {
            Dock = DockStyle.Bottom,
            Height = 44,
            Padding = new Padding(12, 6, 12, 6),
            Text = "Teams 그룹 채팅 입력칸을 열어 두세요. exe 실행 중 화면 꺼짐 방지 ON. 창 닫으면 스케줄 삭제.",
            ForeColor = Color.FromArgb(130, 200, 130)
        };

        Controls.Add(_logBox);
        Controls.Add(hint);
        Controls.Add(topPanel);
        Controls.Add(_pathLabel);
        Controls.Add(_statusLabel);

        _countdownTimer.Interval = 1000;
        _countdownTimer.Tick += CountdownTimer_Tick;

        _keepAwakeTimer.Interval = 60_000;
        _keepAwakeTimer.Tick += (_, _) => KeepAwakeHelper.Refresh();

        Load += async (_, _) => await OnStartupAsync();
        FormClosing += (_, e) =>
        {
            if (_cleanupDone)
                return;

            var ans = MessageBox.Show(
                "창을 닫으면 3분 스케줄이 삭제됩니다.\n종료할까요?",
                "YAN4 SLA Teams",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);
            if (ans != DialogResult.Yes)
            {
                e.Cancel = true;
                return;
            }

            CleanupScheduler();
        };
    }

    private async Task OnStartupAsync()
    {
        KeepAwakeHelper.Enable();
        _keepAwakeTimer.Start();
        UpdatePaths();

        var reg = SchedulerHelper.Register(Environment.ProcessPath!);
        if (!reg.ok)
        {
            SetStatus("[오류] 스케줄 등록 실패");
            AppendLog(reg.message);
            UpdateCountdownLabel("다음 붙여넣기: —");
            return;
        }

        SetStatus("[OK] 3분 스케줄 · 화면 꺼짐 방지 ON — Teams 입력칸 포커스");
        AppendLog(reg.message);
        ResetCountdown(3);
        _countdownTimer.Start();
    }

    private async void CountdownTimer_Tick(object? sender, EventArgs e)
    {
        if (_pasteRunning || _cleanupDone)
            return;

        if (_secondsUntilNextPaste > 0)
        {
            _secondsUntilNextPaste--;
            UpdateCountdownLabel();
            return;
        }

        await RunPasteAsync("자동");
    }

    private async Task RunPasteAsync(string reason)
    {
        if (_pasteRunning)
            return;

        _pasteRunning = true;
        _countdownTimer.Stop();
        _pasteNowButton.Enabled = false;
        SetStatus($"[{reason}] 붙여넣기 실행 중…");
        UpdateCountdownLabel("붙여넣기 실행 중…");
        AppendLog($"--- {DateTime.Now:yyyy-MM-dd HH:mm:ss} paste ({reason}) ---");

        try
        {
            var code = await Task.Run(PasteRunner.RunPasteScript);
            RefreshLog();
            AppendLog($"[paste exit] {code}");
            SetStatus(code == 0 ? "[OK] 붙여넣기 완료/스킵 — 로그 확인" : $"[WARN] paste exit {code}");
        }
        finally
        {
            _pasteRunning = false;
            _pasteNowButton.Enabled = true;
            if (!_cleanupDone)
            {
                ResetCountdown(PasteIntervalSeconds);
                _countdownTimer.Start();
            }
        }
    }

    private void ResetCountdown(int seconds)
    {
        _secondsUntilNextPaste = seconds;
        UpdateCountdownLabel();
    }

    private void UpdateCountdownLabel()
    {
        var m = _secondsUntilNextPaste / 60;
        var s = _secondsUntilNextPaste % 60;
        UpdateCountdownLabel($"다음 붙여넣기: {m}:{s:D2}");
    }

    private void UpdateCountdownLabel(string text) => _countdownLabel.Text = text;

    private void UpdatePaths()
    {
        _pathLabel.Text =
            $"Downloads: {SlaPaths.DownloadsPath}{Environment.NewLine}" +
            $"Inbox    : {SlaPaths.InboxPath}{Environment.NewLine}" +
            $"Log      : {SlaPaths.LogFilePath}";
    }

    private void RefreshLog()
    {
        _logBox.Text = PasteRunner.ReadLogTail(80);
        _logBox.SelectionStart = _logBox.TextLength;
        _logBox.ScrollToCaret();
    }

    private void AppendLog(string line)
    {
        if (_logBox.TextLength > 0)
            _logBox.AppendText(Environment.NewLine);
        _logBox.AppendText(line);
        _logBox.SelectionStart = _logBox.TextLength;
        _logBox.ScrollToCaret();
    }

    private void SetStatus(string text) => _statusLabel.Text = text;

    private void CleanupScheduler()
    {
        if (_cleanupDone)
            return;
        _cleanupDone = true;
        _countdownTimer.Stop();
        _keepAwakeTimer.Stop();
        KeepAwakeHelper.Disable();
        SchedulerHelper.Delete();
    }
}
