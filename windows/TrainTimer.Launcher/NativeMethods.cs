using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;

namespace TrainTimer.Launcher;

internal static class NativeMethods
{
    private const int DwmwaUseImmersiveDarkMode = 20;
    private const int DwmwaWindowCornerPreference = 33;
    private const int DwmwaSystemBackdropType = 38;
    private const int DwmwcpRound = 2;
    private const int DwmsbtMainWindow = 2;

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(
        IntPtr hwnd,
        int attribute,
        ref int value,
        int valueSize);

    public static void ApplyWindowEffects(Window window, bool darkMode)
    {
        if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22000)) return;

        var handle = new WindowInteropHelper(window).EnsureHandle();
        var source = HwndSource.FromHwnd(handle);
        if (source?.CompositionTarget is not null)
        {
            source.CompositionTarget.BackgroundColor = Colors.Transparent;
        }

        var dark = darkMode ? 1 : 0;
        var corner = DwmwcpRound;
        var backdrop = DwmsbtMainWindow;

        _ = DwmSetWindowAttribute(handle, DwmwaUseImmersiveDarkMode, ref dark, sizeof(int));
        _ = DwmSetWindowAttribute(handle, DwmwaWindowCornerPreference, ref corner, sizeof(int));
        _ = DwmSetWindowAttribute(handle, DwmwaSystemBackdropType, ref backdrop, sizeof(int));
    }
}
