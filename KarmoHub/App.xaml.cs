using System;
using Microsoft.UI.Xaml;
using Microsoft.Windows.AppLifecycle;
using KarmoHub.Services;
// using KarmoHub.Tray;

namespace KarmoHub;

public partial class App : Application
{
	private Window? _window;
	// private TrayIconService? _tray;
	private GameProcessService? _gameProcessService;
	private GameLibraryService? _gameLibraryService;
	private GameInstallService? _gameInstallService;

	public App()
	{
		this.InitializeComponent();
	}

	protected override async void OnLaunched(LaunchActivatedEventArgs args)
	{
		try
		{
			// 시작 프로그램 등록
			StartupService.RegisterStartup(Environment.ProcessPath ?? string.Empty);

			// 서비스 초기화
			_gameProcessService = new GameProcessService();
			_gameLibraryService = new GameLibraryService();
			_gameInstallService = new GameInstallService();

			// 메인 윈도우 생성 (표시는 나중에)
			_window = new MainWindow(_gameProcessService, _gameLibraryService, _gameInstallService);
			
			// 윈도우 초기화 (데이터 로드 등)
			if (_window is MainWindow mainWindow)
			{
				await mainWindow.InitializeAsync();
			}

			// 트레이 아이콘 초기화
			// _tray = new TrayIconService(_window as MainWindow, _gameProcessService);

			// WinUI 3는 기본적으로 Launch 시 윈도우를 보여주지 않아도 앱이 실행됨
			_window.Activate();
		}
		catch (Exception ex)
		{
			System.Diagnostics.Debug.WriteLine($"App Launch Error: {ex}");
			Console.WriteLine($"App Launch Error: {ex}");
		}
	}
}
