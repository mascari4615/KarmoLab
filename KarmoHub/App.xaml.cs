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
	private GameInstallService? _gameInstallService;

	protected override async void OnStartup(StartupEventArgs e)
	{
		base.OnStartup(e);

		// 시작 프로그램에 등록
		StartupService.RegisterStartup(Environment.ProcessPath ?? string.Empty);

		_gameProcessService = new GameProcessService();
		_gameLibraryService = new GameLibraryService();
		_gameInstallService = new GameInstallService();

		_mainWindow = new MainWindow(_gameProcessService, _gameLibraryService, _gameInstallService);
		MainWindow = _mainWindow;
		_mainWindow.Hide();
		
		// 초기 데이터 로드 등을 위해 메인 윈도우 초기화
		await _mainWindow.InitializeAsync();

		_tray = new TrayIconService(_gameProcessService, _mainWindow);
	}

	protected override void OnExit(ExitEventArgs e)
	{
		_tray?.Dispose();
		_gameProcessService?.Dispose();
		base.OnExit(e);
	}
}
