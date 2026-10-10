using System.Collections.ObjectModel;
using System.Diagnostics;

namespace YAN4.SlaTeams;

internal static class SchedulerHelper
{
    public static (bool ok, string message) Register(string exePath)
    {
        Delete();

        // /TR: "C:\path\YAN4-SlaTeams.exe" --paste  (ArgumentList로 따옴표 안전 전달)
        var taskRun = $"\"{exePath}\" --paste";
        return RunSchtasks(
            args =>
            {
                args.Add("/Create");
                args.Add("/TN");
                args.Add(SlaPaths.TaskName);
                args.Add("/SC");
                args.Add("MINUTE");
                args.Add("/MO");
                args.Add("3");
                args.Add("/TR");
                args.Add(taskRun);
                args.Add("/F");
                args.Add("/IT");
            },
            "스케줄 등록됨 (3분)");
    }

    public static void Delete()
    {
        RunSchtasks(
            args =>
            {
                args.Add("/Delete");
                args.Add("/TN");
                args.Add(SlaPaths.TaskName);
                args.Add("/F");
            },
            null);
    }

    private static (bool ok, string message) RunSchtasks(
        Action<Collection<string>> buildArgs,
        string? okMessage)
    {
        using var proc = new Process
        {
            StartInfo =
            {
                FileName = "schtasks.exe",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            }
        };

        buildArgs(proc.StartInfo.ArgumentList);

        if (!proc.Start())
            return (false, "schtasks 시작 실패");

        var stdout = proc.StandardOutput.ReadToEnd();
        var stderr = proc.StandardError.ReadToEnd();
        proc.WaitForExit();

        if (proc.ExitCode != 0)
        {
            var detail = string.Join(" ", new[] { stdout, stderr }
                .Select(s => s.Trim())
                .Where(s => !string.IsNullOrEmpty(s)));
            return (false, string.IsNullOrEmpty(detail) ? "schtasks 실패" : detail);
        }

        return (true, okMessage ?? "OK");
    }
}
