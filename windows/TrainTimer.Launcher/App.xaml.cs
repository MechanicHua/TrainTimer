using System.Threading;
using System.Windows;
using System.Windows.Threading;

namespace TrainTimer.Launcher;

public partial class App : Application
{
    private Mutex? _singleInstanceMutex;
    private bool _ownsSingleInstanceMutex;

    protected override void OnStartup(StartupEventArgs e)
    {
        const string mutexName = @"Local\TrainTimer.Windows.Launcher";
        _singleInstanceMutex = new Mutex(initiallyOwned: true, mutexName, out var createdNew);
        _ownsSingleInstanceMutex = createdNew;

        if (!createdNew)
        {
            MessageBox.Show(
                "TrainTimer 启动器已经在运行。",
                "TrainTimer",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
            Shutdown();
            return;
        }

        DispatcherUnhandledException += OnDispatcherUnhandledException;
        var window = new MainWindow();
        MainWindow = window;
        window.Show();
        base.OnStartup(e);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        if (_ownsSingleInstanceMutex) _singleInstanceMutex?.ReleaseMutex();
        _singleInstanceMutex?.Dispose();
        base.OnExit(e);
    }

    private static void OnDispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        MessageBox.Show(
            $"启动器遇到错误：\n\n{e.Exception.Message}",
            "TrainTimer",
            MessageBoxButton.OK,
            MessageBoxImage.Error);
        e.Handled = true;
    }
}
