using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using H.NotifyIcon;
using KarmoHub.Models;
using KarmoHub.Services;

namespace KarmoHub;

public sealed partial class MainWindow : Window
{
	private TaskbarIcon? _taskbarIcon;
	private readonly GameProcessService? _gameProcessService;
	private readonly GameLibraryService? _gameLibraryService;
	private readonly GameInstallService? _gameInstallService;

	public MainWindow(GameProcessService? gameProcessService, GameLibraryService? gameLibraryService, GameInstallService? gameInstallService)
	{
		this.InitializeComponent();
		_gameProcessService = gameProcessService;
		_gameLibraryService = gameLibraryService;
		_gameInstallService = gameInstallService;

		if (_gameProcessService != null)
		{
			_gameProcessService.GameExited += OnGameExited;
		}

		this.Title = "KarmoHub";
		
		// Handle Closing to minimize to tray
		var hWnd = WinRT.Interop.WindowNative.GetWindowHandle(this);
		var windowId = Microsoft.UI.Win32Interop.GetWindowIdFromWindow(hWnd);
		var appWindow = Microsoft.UI.Windowing.AppWindow.GetFromWindowId(windowId);
		appWindow.Closing += AppWindow_Closing;

		// Custom TitleBar
		ExtendsContentIntoTitleBar = true;
		SetTitleBar(AppTitleBar);

		InitializeTaskbarIcon();
	}

	private void InitializeTaskbarIcon()
	{
		_taskbarIcon = new TaskbarIcon
		{
			IconSource = new Microsoft.UI.Xaml.Media.Imaging.BitmapImage(new Uri("ms-appx:///Resources/tray.ico")),
			ToolTipText = "KarmoHub"
		};
        // _taskbarIcon.LeftClick += (s, e) => ShowMainWindow();        _taskbarIcon.TrayLeftMouseUp += (s, e) => ShowMainWindow();
		var flyout = new MenuFlyout();
		var openItem = new MenuFlyoutItem { Text = "KarmoHub 열기" };
		openItem.Click += OnOpenClick;
		var exitItem = new MenuFlyoutItem { Text = "종료" };
		exitItem.Click += OnExitClick;
		
		flyout.Items.Add(openItem);
		flyout.Items.Add(exitItem);

		_taskbarIcon.ContextFlyout = flyout;
		
		// Add to visual tree
		RootGrid.Children.Add(_taskbarIcon);
	}

	private void AppWindow_Closing(Microsoft.UI.Windowing.AppWindow sender, Microsoft.UI.Windowing.AppWindowClosingEventArgs args)
	{
		args.Cancel = true;
		sender.Hide();
	}
	
	private void OnClosed(object sender, WindowEventArgs args)
	{
	}

	private void OnTrayLeftClick(object sender, object e)
	{
		ShowMainWindow();
	}

	private void OnOpenClick(object sender, RoutedEventArgs e)
    {
        ShowMainWindow();
    }

    private void OnExitClick(object sender, RoutedEventArgs e)
    {
        // Actually exit
        _taskbarIcon?.Dispose();
        Application.Current.Exit();
    }


	public async Task InitializeAsync()
	{
		await LoadGamesAsync();
	}

	private async Task LoadGamesAsync()
	{
		if (_gameLibraryService != null)
		{
			GameInfos.ItemsSource = await _gameLibraryService.GetGamesAsync();
		}
	}
	
	public void ShowMainWindow()
	{
		this.Activate(); // In WinUI 3, Show() is Activate()
		UpdateStatus();
	}

	public void UpdateStatus()
	{
		if (_gameProcessService != null)
		{
			StatusText.Text = _gameProcessService.IsRunning ? "상태: 실행 중" : "상태: 대기 중";
		}
	}

	private void OnStopGame(object sender, RoutedEventArgs e)
	{
		_gameProcessService?.StopGame();
		UpdateStatus();
	}

	private void OnOpenFolderClick(object sender, RoutedEventArgs e)
	{
		if (sender is Button button && button.DataContext is GameItem game)
		{
			// ... (Same logic as WPF, just use System.Diagnostics.Process)
			// Need to verify paths
			string path = game.ExecutablePath;
			if (!Path.IsPathRooted(path))
			{
				var baseDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KarmoLab");
				path = Path.Combine(baseDir, path);
			}
			
			// ...
			// Simple implementation for now
			var folder = Path.GetDirectoryName(path);
			if (Directory.Exists(folder))
			{
				System.Diagnostics.Process.Start("explorer.exe", folder);
			}
		}
	}

	private async void OnPlayButtonClick(object sender, RoutedEventArgs e)
	{
		if (sender is Button button && button.DataContext is GameItem game)
		{
			if (game.Status == GameStatus.Ready)
			{
				AddLog($"{game.Name} 실행 시도...");
				_gameProcessService?.StartGame(game.ExecutablePath);
			}
			else if (game.Status == GameStatus.NotInstalled || game.Status == GameStatus.UpdateAvailable)
			{
				// Install logic
				if (_gameInstallService != null)
				{
					AddLog($"{game.Name} 설치 시작...");
					button.IsEnabled = false;
					var progress = new Progress<int>(p => 
					{
						StatusText.Text = $"설치 중... {p}%";
					});
					
					try 
					{
						await _gameInstallService.InstallGameAsync(game, progress);
						AddLog("설치 완료");
						await LoadGamesAsync(); // Refresh
					}
					catch (Exception ex)
					{
						AddLog($"오류: {ex.Message}");
						// WinUI 3 ContentDialog would be better than MessageBox
						// System.Windows.Forms.MessageBox.Show(ex.Message);
					}
					finally
					{
						button.IsEnabled = true;
						StatusText.Text = "준비됨";
					}
				}
			}
		}
	}
	
	private void OnGameExited(object? sender, EventArgs e)
	{
		this.DispatcherQueue.TryEnqueue(() => 
		{
			UpdateStatus();
			AddLog("게임 종료됨.");
		});
	}

	public void AddLog(string message)
	{
		var logMessage = $"[{DateTime.Now:HH:mm:ss}] {message}";
		LogListBox.Items.Add(logMessage);
		if (LogListBox.Items.Count > 0)
		{
			LogListBox.ScrollIntoView(LogListBox.Items[LogListBox.Items.Count - 1]);
		}
	}
}
