namespace YAN4.SlaTeams;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Any(a => string.Equals(a, "--paste", StringComparison.OrdinalIgnoreCase)))
        {
            KeepAwakeHelper.Enable();
            try
            {
                return PasteRunner.RunPasteScript();
            }
            finally
            {
                KeepAwakeHelper.Disable();
            }
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
        return 0;
    }
}
