using System.Windows;
using System.Windows.Controls;
using System.Diagnostics;
using System.IO;
using KarmoHub.Models;
using KarmoHub.Services;
using Application = System.Windows.Application;

namespace KarmoHub;

public partial class MainWindow : Window
{
	private readonly GameProcessService _gameProcessService;
	private readonly GameLibraryService _gameLibraryService;
	private readonly GameInstallService _gameInstallService;

	public MainWindow(GameProcessService gameProcessService, GameLibraryService gameLibraryService, GameInstallService gameInstallService)
	{
		InitializeComponent();
		_gameProcessService = gameProcessService;
		_gameLibraryService = gameLibraryService;
		_gameInstallService = gameInstallService;

		_gameProcessService.GameExited += OnGameExited;
		
		UpdateStatus();
	}

	public async Task InitializeAsync()
	{
		await LoadGamesAsync();
	}

	private async Task LoadGamesAsync()
	{
		GameInfos.ItemsSource = await _gameLibraryService.GetGamesAsync();
	}

	private void OnOpenFolderClick(object sender, RoutedEventArgs e)
	{
		if (sender is System.Windows.Controls.Button button && button.DataContext is GameItem game)
		{
			// 설치되지 않은 경우 처리
			if (game.Status == GameStatus.NotInstalled || game.Status == GameStatus.Unavailable)
			{
				System.Windows.MessageBox.Show("게임이 설치되지 않았습니다.", "알림", MessageBoxButton.OK, MessageBoxImage.Information);
				return;
			}

			try
			{
				string path = game.ExecutablePath;
				
				// 상대 경로인 경우 절대 경로로 변환 (BaseDirectory 기준)
				if (!Path.IsPathRooted(path))
				{
					path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, path);
				}
				path = Path.GetFullPath(path); // 경로 정규화

				// 파일 경로라면 디렉토리만 추출
				string? folderPath = Directory.Exists(path) ? path : Path.GetDirectoryName(path);

				if (!string.IsNullOrEmpty(folderPath) && Directory.Exists(folderPath))
				{
					Process.Start(new ProcessStartInfo
					{
						FileName = folderPath,
						UseShellExecute = true,
						Verb = "open"
					});
				}
				else
				{
					System.Windows.MessageBox.Show($"폴더를 찾을 수 없습니다.\n경로: {folderPath}", "오류", MessageBoxButton.OK, MessageBoxImage.Error);
				}
			}
			catch (Exception ex)
			{
				System.Windows.MessageBox.Show($"폴더 열기 실패: {ex.Message}", "오류", MessageBoxButton.OK, MessageBoxImage.Error);
			}
		}
	}

	private async void OnPlayButtonClick(object sender, RoutedEventArgs e)
	{
		if (sender is System.Windows.Controls.Button button && button.DataContext is GameItem game)
		{
			switch (game.Status)
			{
				case GameStatus.Ready:
					AddLog($"{game.Name} 실행 시도...");
					_gameProcessService.StartGame(game.ExecutablePath);
					break;
				case GameStatus.Unavailable:
					AddLog($"{game.Name} 설치 불가 (Release 없음)");
					System.Windows.MessageBox.Show("설치할 수 있는 파일이나 버전 정보가 없습니다.\nGitHub Repository에 Release가 존재하는지 확인해주세요.", "설치 불가", MessageBoxButton.OK, MessageBoxImage.Warning);
					break;
				case GameStatus.NotInstalled:
				case GameStatus.UpdateAvailable:
					try
					{
						button.IsEnabled = false;
						StatusText.Text = $"설치 중... {game.Name}";
						AddLog($"{game.Name} 설치 시작 (URL: {game.DownloadUrl})");
						
						var progress = new Progress<int>(percent => 
						{
							if (percent < 100)
							{
								StatusText.Text = $"다운로드 중... {game.Name} ({percent}%)";
								// 다운로드는 너무 자주 로그를 남기면 안되므로 10% 단위로 남기거나 생략
								if (percent % 10 == 0 && percent > 0)
								{
									AddLog($"{game.Name} 다운로드: {percent}%");
								}
							}
							else if (percent >= 100)
							{
								var extractPercent = percent - 100;
								StatusText.Text = $"압축 해제 중... {game.Name} ({extractPercent}%)";
								if (extractPercent == 0) AddLog($"{game.Name} 다운로드 완료. 압축 해제 시작...");
							}
						});

						await _gameInstallService.InstallGameAsync(game, progress);
						
						StatusText.Text = $"설치 완료! {game.Name}";
						AddLog($"{game.Name} 설치 및 압축 해제 완료.");
						
						System.Windows.MessageBox.Show("설치가 완료되었습니다.", "KarmoHub", MessageBoxButton.OK, MessageBoxImage.Information);
					}
					catch (Exception ex)
					{
						StatusText.Text = "설치 오류 발생";
						AddLog($"설치 에러: {ex.Message}");
						System.Windows.MessageBox.Show($"설치 실패: {ex.Message}", "오류", MessageBoxButton.OK, MessageBoxImage.Error);
					}
					finally
					{
						button.IsEnabled = true;
						await LoadGamesAsync(); // UI 갱신을 위해 목록 다시 로드
						UpdateStatus();
					}
					break;
			}
			UpdateStatus();
		}
	}
	
	private void OnStopGame(object sender, RoutedEventArgs e)
	{
		_gameProcessService.StopGame();
		UpdateStatus();
	}

	private void OnHide(object sender, RoutedEventArgs e)
	{
		Hide();
	}

	protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
	{
		if (Application.Current?.Dispatcher.HasShutdownStarted == true || Application.Current?.Dispatcher.HasShutdownFinished == true)
		{
			base.OnClosing(e);
			return;
		}

		// 창 닫기 대신 숨김 처리로 트레이 앱이 유지되도록 한다.
		e.Cancel = true;
		Hide();
	}

	public void ShowMainWindow()
	{
		Show();
		WindowState = WindowState.Normal;
		Activate();
		UpdateStatus();
	}

	public void UpdateStatus()
	{
		StatusText.Text = _gameProcessService.IsRunning ? "상태: 실행 중" : "상태: 대기 중";
	}

	private void OnGameExited(object? sender, EventArgs e)
	{
		Dispatcher.Invoke(() => 
		{
			UpdateStatus();
			AddLog("게임 종료됨.");
		});
	}

	private void AddLog(string message)
	{
		var logMessage = $"[{DateTime.Now:HH:mm:ss}] {message}";
		LogListBox.Items.Add(logMessage);
		
		// 자동 스크롤
		if (LogListBox.Items.Count > 0)
		{
			LogListBox.ScrollIntoView(LogListBox.Items[LogListBox.Items.Count - 1]);
		}
	}
}
