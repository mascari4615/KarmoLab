using System;
using System.Diagnostics;
using System.IO;

namespace KarmoHub.Services;

public sealed class GameProcessService : IDisposable
{
	private Process? _gameProcess;

	public event EventHandler? GameExited;

	public bool IsRunning => _gameProcess is { HasExited: false };

	public bool StartGame(string executablePath)
	{
		if (IsRunning)
		{
			// MessageBox.Show("이미 다른 프로그램이 실행 중입니다.", "KarmoHub", MessageBoxButton.OK, MessageBoxImage.Information);
			return true;
		}

		// 절대 경로가 아니라면 AppData/Local/KarmoLab 기준 상대 경로로 처리
		if (!Path.IsPathRooted(executablePath))
		{
			var baseDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KarmoLab");
			executablePath = Path.Combine(baseDir, executablePath);
		}

		if (!File.Exists(executablePath) && !IsSystemCommand(executablePath))
		{
			// MessageBox.Show($"실행 파일을 찾을 수 없습니다:\n{executablePath}", "KarmoHub", MessageBoxButton.OK, MessageBoxImage.Warning);
			return false;
		}

		try
		{
			var startInfo = new ProcessStartInfo
			{
				FileName = executablePath,
				UseShellExecute = true,
				WorkingDirectory = Path.GetDirectoryName(executablePath) ?? string.Empty
			};

			_gameProcess = Process.Start(startInfo);
			if (_gameProcess is not null)
			{
				_gameProcess.EnableRaisingEvents = true;
				_gameProcess.Exited += OnGameExited;
				return true;
			}

			// MessageBox.Show("게임 프로세스를 시작하지 못했습니다.", "KarmoHub", MessageBoxButton.OK, MessageBoxImage.Error);
			return false;
		}
		catch (Exception ex)
		{
			System.Diagnostics.Debug.WriteLine($"Error starting game: {ex.Message}");
			// MessageBox.Show($"게임 실행 중 오류가 발생했습니다:\n{ex.Message}", "KarmoHub", MessageBoxButton.OK, MessageBoxImage.Error);
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
			System.Diagnostics.Debug.WriteLine($"Error stopping game: {ex.Message}");
			// MessageBox.Show($"게임 종료 중 오류가 발생했습니다:\n{ex.Message}", "KarmoHub", MessageBoxButton.OK, MessageBoxImage.Error);
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
			// 프로세스는 종료하지 않고 핸들만 해제할 수도 있음. 정책에 따라 결정.
			// 여기서는 런처 종료 시 자원만 해제
			_gameProcess = null;
		}
	}

	// 간단한 시스템 명령어 판별 (예: notepad.exe 등 path에 있는 것)
	private bool IsSystemCommand(string path)
	{
		return !path.Contains(Path.DirectorySeparatorChar) && !path.Contains(Path.AltDirectorySeparatorChar);
	}
}
