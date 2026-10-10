using Microsoft.Win32;

namespace YAN4.SlaTeams;

internal static class SlaPaths
{
    public const string TaskName = "YAN4 SLA Teams Inbox Paste";
    public const string LogFileName = "sla-teams-paste.log";
    public const string PasteScriptName = "YAN4-SLA-TeamsPaste.ps1";

    public static string AppDirectory =>
        Path.GetDirectoryName(Environment.ProcessPath) ?? AppContext.BaseDirectory;

    public static string PasteScriptPath => Path.Combine(AppDirectory, PasteScriptName);

    public static string DownloadsPath
    {
        get
        {
            try
            {
                using var key = Registry.CurrentUser.OpenSubKey(
                    @"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders");
                var raw = key?.GetValue("{374DE290-123F-4565-9164-39C92E26B867}") as string;
                if (!string.IsNullOrWhiteSpace(raw))
                {
                    var expanded = Environment.ExpandEnvironmentVariables(raw);
                    if (Directory.Exists(expanded))
                        return expanded;
                }
            }
            catch
            {
                // ignore
            }

            var fallback = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
            if (Directory.Exists(fallback))
                return fallback;

            var oneDrive = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                "OneDrive",
                "Downloads");
            return Directory.Exists(oneDrive) ? oneDrive : fallback;
        }
    }

    public static string InboxPath => Path.Combine(DownloadsPath, "Inbox");

    public static string LogFilePath => Path.Combine(DownloadsPath, LogFileName);
}
