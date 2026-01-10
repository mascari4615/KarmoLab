using System;
using System.Diagnostics;
using System.IO;
using System.Windows;
using MessageBox = System.Windows.MessageBox;

namespace KarmoHub.Services;

public sealed class GameProcessService : IDisposable
{
	private Process? _gameProcess;

	public event EventHandler? GameExited;

	// TODO: 실제 Unity 빌드 경로로 교체하세요.
	private const string GameExecutablePath = @"C:\\Path\\To\\MyUnityGame.exe";

	public bool IsRunning => _gameProcess is { HasExited: false };

	public bool StartGame()
	{
		if (IsRunning)
		{
			MessageBox.Show("이미 게임이 실행 중입니다.", "KarmoHub", MessageBoxButton.OK, MessageBoxImage.Information);
			return true;
		}

		if (!File.Exists(GameExecutablePath))
		{
			MessageBox.Show($"게임 실행 파일을 찾을 수 없습니다.\n경로를 수정하세요:\n{GameExecutablePath}", "KarmoHub", MessageBoxButton.OK, MessageBoxImage.Warning);
			return false;
		}

		try
		{
			var startInfo = new ProcessStartInfo
			{
				FileName = GameExecutablePath,
				UseShellExecute = true,
				WorkingDirectory = Path.GetDirectoryName(GameExecutablePath) ?? string.Empty
			};

			_gameProcess = Process.Start(startInfo);
			if (_gameProcess is not null)
			{
				_gameProcess.EnableRaisingEvents = true;
				_gameProcess.Exited += OnGameExited;
				return true;
			}

			MessageBox.Show("게임 프로세스를 시작하지 못했습니다.", "KarmoHub", MessageBoxButton.OK, MessageBoxImage.Error);
			return false;
		}
		catch (Exception ex)
		{
			MessageBox.Show($"게임 실행 중 오류가 발생했습니다:\n{ex.Message}", "KarmoHub", MessageBoxButton.OK, MessageBoxImage.Error);
			return false;
		}
	}

	public void StopGame()
	{
		if (!IsRunning)
		{
			return;
		}

		try
		{
			_gameProcess!.Kill(true);
			_gameProcess = null;
		}
		catch (Exception ex)
		{
			MessageBox.Show($"게임 종료 중 오류가 발생했습니다:\n{ex.Message}", "KarmoHub", MessageBoxButton.OK, MessageBoxImage.Error);
		}
	}

	private void OnGameExited(object? sender, EventArgs e)
	{
		_gameProcess?.Dispose();
		_gameProcess = null;
		GameExited?.Invoke(this, EventArgs.Empty);
	}

	public void Dispose()
	{
		if (_gameProcess is not null)
		{
			_gameProcess.Exited -= OnGameExited;
			if (!_gameProcess.HasExited)
			{
				_gameProcess.Dispose();
			}
			_gameProcess = null;
		}
	}
}
