using System.Windows;
using Launcher.Services;
using Launcher.Tray;
using Application = System.Windows.Application;

namespace Launcher;

public partial class App : Application
{
    private TrayIconService? _tray;
    private MainWindow? _mainWindow;
    private GameProcessService? _gameProcessService;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        _gameProcessService = new GameProcessService();
        _mainWindow = new MainWindow(_gameProcessService);
        MainWindow = _mainWindow;
        _mainWindow.Hide();

        _tray = new TrayIconService(_gameProcessService, _mainWindow);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _tray?.Dispose();
        _gameProcessService?.Dispose();
        base.OnExit(e);
    }
}
