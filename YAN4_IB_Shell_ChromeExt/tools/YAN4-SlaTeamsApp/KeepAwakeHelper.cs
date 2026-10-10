using System.Runtime.InteropServices;

namespace YAN4.SlaTeams;

/// <summary>
/// exe 실행 중 화면 꺼짐·유휴 잠금 타이머 리셋 (SetThreadExecutionState).
/// </summary>
internal static class KeepAwakeHelper
{
    private const uint EsContinuous = 0x80000000;
    private const uint EsSystemRequired = 0x00000001;
    private const uint EsDisplayRequired = 0x00000002;

    private static bool _enabled;

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern uint SetThreadExecutionState(uint esFlags);

    public static void Enable()
    {
        Refresh();
    }

    /// <summary>Windows가 상태를 풀 수 있어 주기적으로 다시 호출.</summary>
    public static void Refresh()
    {
        var result = SetThreadExecutionState(EsContinuous | EsSystemRequired | EsDisplayRequired);
        _enabled = result != 0;
    }

    public static void Disable()
    {
        if (!_enabled)
            return;

        SetThreadExecutionState(EsContinuous);
        _enabled = false;
    }
}
