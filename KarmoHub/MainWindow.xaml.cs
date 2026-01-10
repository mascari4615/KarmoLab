using System.Windows;
using System.Windows.Controls;
using KarmoHub.Models;
using KarmoHub.Services;
using Application = System.Windows.Application;

namespace KarmoHub;

public partial class MainWindow : Window
{
	private readonly GameProcessService _gameProcessService;
	private readonly GameLibraryService _gameLibraryService;

	public MainWindow(GameProcessService gameProcessService, GameLibraryService gameLibraryService)
	{
		InitializeComponent();
		_gameProcessService = gameProcessService;
		_gameLibraryService = gameLibraryService;
		_gameProcessService.GameExited += OnGameExited;
		
		LoadGames();
		UpdateStatus();
	}

	private void LoadGames()
	{
		GameInfos.ItemsSource = _gameLibraryService.GetGames();
	}

	private void OnPlayButtonClick(object sender, RoutedEventArgs e)
	{
		if (sender is System.Windows.Controls.Button button && button.DataContext is GameItem game)
		{
			_gameProcessService.StartGame(game.ExecutablePath);
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
		Dispatcher.Invoke(UpdateStatus);
	}
}
