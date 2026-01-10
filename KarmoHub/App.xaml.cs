using System.Windows;
using KarmoHub.Services;
using KarmoHub.Tray;
using Application = System.Windows.Application;

namespace KarmoHub;

public partial class App : Application
{
	private TrayIconService? _tray;
	private MainWindow? _mainWindow;
	private GameProcessService? _gameProcessService;
	private GameLibraryService? _gameLibraryService;

	protected override void OnStartup(StartupEventArgs e)
	{
		base.OnStartup(e);

		// 시작 프로그램에 등록
		StartupService.RegisterStartup(Environment.ProcessPath ?? string.Empty);

		_gameProcessService = new GameProcessService();
		_gameLibraryService = new GameLibraryService();

		_mainWindow = new MainWindow(_gameProcessService, _gameLibraryService);
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
