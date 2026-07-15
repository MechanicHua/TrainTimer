using System.ComponentModel;
using System.Diagnostics;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Win32;

namespace TrainTimer.Launcher;

public partial class MainWindow : Window
{
    private readonly LauncherController _controller = new();
    private readonly DispatcherTimer _refreshTimer;
    private bool _allowClose;
    private bool _closing;
    private readonly bool _darkMode;

    public MainWindow()
    {
        InitializeComponent();
        _darkMode = DetectDarkMode();
        ApplyTheme(_darkMode);

        _controller.StateChanged += Controller_StateChanged;
        _refreshTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(5) };
        _refreshTimer.Tick += RefreshTimer_Tick;

        SourceInitialized += (_, _) => NativeMethods.ApplyWindowEffects(this, _darkMode);
        Loaded += MainWindow_Loaded;
        PreviewKeyDown += MainWindow_PreviewKeyDown;
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        _refreshTimer.Start();
        await _controller.InitializeAsync(autoOpenBrowser: true);
    }

    private async void RefreshTimer_Tick(object? sender, EventArgs e)
    {
        await _controller.RefreshAsync();
    }

    private async void RefreshButton_Click(object sender, RoutedEventArgs e)
    {
        await _controller.RefreshAsync(forceFeedback: true);
    }

    private async void StopButton_Click(object sender, RoutedEventArgs e)
    {
        await _controller.StopServiceAsync();
    }

    private async void RestartButton_Click(object sender, RoutedEventArgs e)
    {
        await _controller.RestartServiceAsync();
    }

    private async void PrimaryButton_Click(object sender, RoutedEventArgs e)
    {
        if (_controller.Current.IsRunning)
        {
            await _controller.OpenBrowserAsync();
        }
        else
        {
            await _controller.StartServiceAsync(openBrowserWhenReady: true);
        }
    }

    private void CopyButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            Clipboard.SetText(_controller.Current.Url);
            LastCheckedText.Text = "网页地址已复制";
        }
        catch (Exception ex)
        {
            LastCheckedText.Text = $"复制失败：{ex.Message}";
        }
    }

    private void LogButton_Click(object sender, RoutedEventArgs e)
    {
        _controller.OpenLog();
    }

    private async void MainWindow_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if ((Keyboard.Modifiers & ModifierKeys.Control) == 0) return;

        if (e.Key == Key.R)
        {
            e.Handled = true;
            await _controller.RefreshAsync(forceFeedback: true);
        }
        else if (e.Key == Key.L)
        {
            e.Handled = true;
            _controller.OpenLog();
        }
    }

    private void Controller_StateChanged(object? sender, LauncherSnapshot snapshot)
    {
        Dispatcher.InvokeAsync(() => Render(snapshot));
    }

    private void Render(LauncherSnapshot snapshot)
    {
        StatusTitleText.Text = snapshot.Title;
        StatusMessageText.Text = snapshot.Message;
        AddressText.Text = snapshot.Url;
        BrowserText.Text = snapshot.ChromeAvailable
            ? snapshot.BrowserMessage
            : "默认浏览器 · 未检测到 Google Chrome";
        LastCheckedText.Text = snapshot.Feedback ?? $"刚刚检查 · {snapshot.CheckedAt:HH:mm:ss}";

        var statusBrush = snapshot.Kind switch
        {
            LauncherStateKind.Ready => FindBrush("StatusGreenBrush"),
            LauncherStateKind.Error => FindBrush("StatusRedBrush"),
            _ => FindBrush("StatusAmberBrush")
        };
        StatusCircle.Background = statusBrush;
        StatusGlyph.Text = snapshot.Kind switch
        {
            LauncherStateKind.Ready => "\uE73E",
            LauncherStateKind.Error => "\uEA39",
            _ => "\uE895"
        };

        RefreshButton.IsEnabled = !snapshot.IsBusy;
        StopButton.IsEnabled = snapshot.IsRunning && snapshot.OwnsProcess && !snapshot.IsBusy;
        RestartButton.IsEnabled = snapshot.IsRunning && snapshot.OwnsProcess && !snapshot.IsBusy;
        CopyButton.IsEnabled = snapshot.IsRunning;
        PrimaryButton.IsEnabled = !snapshot.IsBusy;
        PrimaryButtonText.Text = snapshot.IsRunning
            ? (snapshot.ChromeAvailable ? "在 Chrome 中打开" : "在浏览器中打开")
            : "启动服务";
    }

    protected override async void OnClosing(CancelEventArgs e)
    {
        if (_allowClose)
        {
            base.OnClosing(e);
            return;
        }

        e.Cancel = true;
        if (_closing) return;

        _closing = true;
        _refreshTimer.Stop();
        await _controller.DisposeAsync();
        _allowClose = true;
        Close();
    }

    private Brush FindBrush(string key) => (Brush)FindResource(key);

    private static bool DetectDarkMode()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
            return key?.GetValue("AppsUseLightTheme") is int value && value == 0;
        }
        catch
        {
            return false;
        }
    }

    private void ApplyTheme(bool dark)
    {
        if (!dark) return;

        Resources["WindowBackgroundBrush"] = Brush("#D91F1F1F");
        Resources["TextPrimaryBrush"] = Brush("#F2FFFFFF");
        Resources["TextSecondaryBrush"] = Brush("#B3FFFFFF");
        Resources["TextTertiaryBrush"] = Brush("#8AFFFFFF");
        Resources["CardBrush"] = Brush("#B8242424");
        Resources["CardBorderBrush"] = Brush("#24FFFFFF");
        Resources["DividerBrush"] = Brush("#20FFFFFF");
        Resources["SubtleButtonBrush"] = Brush("#18FFFFFF");
        Resources["SubtleButtonHoverBrush"] = Brush("#2AFFFFFF");
    }

    private static SolidColorBrush Brush(string value)
    {
        var color = (Color)ColorConverter.ConvertFromString(value);
        var brush = new SolidColorBrush(color);
        brush.Freeze();
        return brush;
    }
}
