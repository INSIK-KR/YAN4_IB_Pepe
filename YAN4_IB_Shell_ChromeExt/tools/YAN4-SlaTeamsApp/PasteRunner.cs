using System.Diagnostics;
using System.Reflection;
using System.Text;

namespace YAN4.SlaTeams;

internal static class PasteRunner
{
    private const string EmbeddedResourceName = "YAN4.SlaTeams.PasteScript.ps1";

    public static int RunPasteScript()
    {
        var ps1 = MaterializePasteScript();
        if (ps1 == null)
            return 2;

        try
        {
            var cmd = $"Get-Content -LiteralPath '{EscapePs1(ps1)}' -Raw -Encoding UTF8 | Invoke-Expression";
            using var proc = Process.Start(new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -Command \"{cmd}\"",
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            });

            if (proc == null)
                return 3;

            proc.WaitForExit();
            return proc.ExitCode;
        }
        finally
        {
            try { File.Delete(ps1); } catch { /* ignore */ }
        }
    }

    public static string ReadLogTail(int lines = 60)
    {
        var path = SlaPaths.LogFilePath;
        if (!File.Exists(path))
            return "(로그 없음 — Inbox batch 대기 중)";

        try
        {
            var all = File.ReadAllLines(path, Encoding.UTF8);
            if (all.Length == 0)
                return "(로그 파일 비어 있음)";

            var start = Math.Max(0, all.Length - lines);
            return string.Join(Environment.NewLine, all, start, all.Length - start);
        }
        catch (Exception ex)
        {
            return $"[로그 읽기 실패] {ex.Message}";
        }
    }

    private static string? MaterializePasteScript()
    {
        var external = SlaPaths.PasteScriptPath;
        if (File.Exists(external))
            return external;

        var asm = Assembly.GetExecutingAssembly();
        using var stream = asm.GetManifestResourceStream(EmbeddedResourceName);
        if (stream == null)
            return null;

        using var reader = new StreamReader(stream, Encoding.UTF8);
        var content = reader.ReadToEnd();
        var temp = Path.Combine(Path.GetTempPath(), "yan4-sla-teams-paste.ps1");
        File.WriteAllText(temp, content, new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
        return temp;
    }

    private static string EscapePs1(string path) =>
        path.Replace("'", "''");
}
