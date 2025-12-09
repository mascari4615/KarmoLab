using System; 
using System.Drawing;
using System.Windows;
using System.Windows.Forms;
using Launcher.Services;
using Application = System.Windows.Application;

namespace Launcher.Tray;

public sealed class TrayIconService : IDisposable
{
    private readonly NotifyIcon _notifyIcon;
    private readonly GameProcessService _gameProcessService;
    private readonly MainWindow _mainWindow;

    public TrayIconService(GameProcessService gameProcessService, MainWindow mainWindow)
    {
        _gameProcessService = gameProcessService;
        _mainWindow = mainWindow;

        _notifyIcon = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Visible = true,
            Text = "Launcher"
        };

        var menu = new ContextMenuStrip();
        menu.Items.Add("게임 실행", null, (_, _) => _gameProcessService.StartGame());
        menu.Items.Add("메인 창 열기", null, (_, _) => ShowMainWindow());
        menu.Items.Add("종료", null, (_, _) => ExitApplication());
        _notifyIcon.ContextMenuStrip = menu;
    }

    private void ShowMainWindow()
    {
        Application.Current.Dispatcher.Invoke(() => _mainWindow.ShowMainWindow());
    }

    private void ExitApplication()
    {
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
        Application.Current.Shutdown();
    }

    public void Dispose()
    {
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
    }
}
