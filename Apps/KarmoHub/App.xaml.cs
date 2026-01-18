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

	private System.Threading.Mutex? _mutex;

	public App()
	{
		// 전역 예외 처리 핸들러 등록
		DispatcherUnhandledException += OnDispatcherUnhandledException;
		AppDomain.CurrentDomain.UnhandledException += OnUnhandledException;
		TaskScheduler.UnobservedTaskException += OnUnobservedTaskException;
	}

	private void OnDispatcherUnhandledException(object sender, System.Windows.Threading.DispatcherUnhandledExceptionEventArgs e)
	{
		string errorMessage = $"UI 스레드 오류 발생: {e.Exception.Message}\n\n{e.Exception.StackTrace}";
		System.Windows.MessageBox.Show(errorMessage, "KarmoHub 치명적 오류 (UI)", MessageBoxButton.OK, MessageBoxImage.Error);
		e.Handled = true; // 앱 종료 방지 시도 (선택 사항)
		Shutdown();
	}

	private void OnUnhandledException(object sender, UnhandledExceptionEventArgs e)
	{
		string errorMessage = $"치명적 오류 발생 (Runtime): {(e.ExceptionObject as Exception)?.Message}\n\n{(e.ExceptionObject as Exception)?.StackTrace}";
		System.Windows.MessageBox.Show(errorMessage, "KarmoHub 치명적 오류 (Global)", MessageBoxButton.OK, MessageBoxImage.Error);
		// 여기서는 Shutdown 호출 불가 (이미 종료 중일 수 있음)
	}

	private void OnUnobservedTaskException(object? sender, UnobservedTaskExceptionEventArgs e)
	{
		string errorMessage = $"비동기 작업 오류 발생: {e.Exception.Message}\n\n{e.Exception.StackTrace}";
		// UI 스레드가 아닐 수 있으므로 Dispatcher 사용
		Current.Dispatcher.Invoke(() => 
		{
			System.Windows.MessageBox.Show(errorMessage, "KarmoHub 비동기 오류", MessageBoxButton.OK, MessageBoxImage.Error);
		});
		e.SetObserved();
	}

	protected override void OnStartup(StartupEventArgs e)
	{
		base.OnStartup(e);

		try
		{
			// 싱글 인스턴스 보장 (디버깅을 위해 임시 주석 처리)
			// _mutex = new System.Threading.Mutex(true, "KarmoHub_Unique_Mutex_Name", out bool createdNew);
			// if (!createdNew)
			// {
			// 	System.Windows.MessageBox.Show("이미 KarmoHub가 실행 중입니다.", "알림", MessageBoxButton.OK, MessageBoxImage.Information);
			// 	Shutdown();
			// 	return;
			// }

			// 언인스톨 모드 확인
			if (e.Args.Length >= 2 && e.Args[0] == "--uninstall")
			{
				var gameId = e.Args[1];
				PerformUninstall(gameId);
				Shutdown();
				return;
			}

			// 시작 프로그램에 등록
			StartupService.RegisterStartup(Environment.ProcessPath ?? string.Empty);

			_gameProcessService = new GameProcessService();
			_gameLibraryService = new GameLibraryService();
			_gameInstallService = new GameInstallService();

			_mainWindow = new MainWindow(_gameProcessService, _gameLibraryService, _gameInstallService);
			MainWindow = _mainWindow;
			
			// 초기 데이터 로드 (비동기로 시작하되 Startup을 블록하지 않음)
			_ = _mainWindow.InitializeAsync();

			_tray = new TrayIconService(_gameProcessService, _mainWindow);

			// 앱 시작 시 메인 창 표시
			_mainWindow.ShowMainWindow();
		}
		catch (Exception ex)
		{
			System.Windows.MessageBox.Show($"앱 시작 중 치명적인 오류 발생:\n{ex.ToString()}", "KarmoHub 오류", MessageBoxButton.OK, MessageBoxImage.Error);
			Shutdown();
		}
	}

	private void PerformUninstall(string gameId)
	{
		// 간단한 삭제 로직 (레지스트리 및 파일 삭제)
		// 실제로는 사용자 확인 창 등을 띄우는 것이 좋음
		var result = System.Windows.MessageBox.Show($"정말 삭제하시겠습니까? (GameID: {gameId})", "게임 삭제", MessageBoxButton.YesNo, MessageBoxImage.Question);
		if (result != MessageBoxResult.Yes) return;

		try
		{
			// 1. 레지스트리 삭제
			string keyPath = $@"Software\Microsoft\Windows\CurrentVersion\Uninstall\KarmoLab_{gameId}";
			using (var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(keyPath, true))
			{
				if (key != null)
				{
					// 설치 경로 확인
					var installPath = key.GetValue("InstallLocation") as string;
					
					// 레지스트리 키 삭제
					Microsoft.Win32.Registry.CurrentUser.DeleteSubKeyTree(keyPath, false);

					// 2. 파일 삭제
					if (!string.IsNullOrEmpty(installPath) && System.IO.Directory.Exists(installPath))
					{
						System.IO.Directory.Delete(installPath, true);
					}

					// 3. 시작 메뉴 바로가기 삭제
					try
					{
						// game.Name 정보가 없으므로 GameId 기반으로 찾거나 폴더를 정리해야 함
						// 하지만 여기서는 레지스트리 정보만으로는 Name을 알기 어려움.
						// 레지스트리에서 DisplayName을 가져올 수 있음
						var gameName = key.GetValue("DisplayName") as string;
						if (!string.IsNullOrEmpty(gameName))
						{
							var startMenuPath = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
							var lnkPath = System.IO.Path.Combine(startMenuPath, "KarmoLab", $"{gameName}.lnk");
							if (System.IO.File.Exists(lnkPath))
							{
								System.IO.File.Delete(lnkPath);
							}
						}
					}
					catch { /* 무시 */ }
				}
			}
			
			System.Windows.MessageBox.Show("삭제 완료되었습니다.", "알림", MessageBoxButton.OK, MessageBoxImage.Information);
		}
		catch (Exception ex)
		{
			System.Windows.MessageBox.Show($"삭제 중 오류가 발생했습니다: {ex.Message}", "오류", MessageBoxButton.OK, MessageBoxImage.Error);
		}
	}

	protected override void OnExit(ExitEventArgs e)
	{
		_tray?.Dispose();
		_gameProcessService?.Dispose();
		base.OnExit(e);
	}
}
