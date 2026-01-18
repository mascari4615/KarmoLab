using System;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Forms;
using KarmoHub.Services;
using Application = System.Windows.Application;

namespace KarmoHub.Tray;

public sealed class TrayIconService : IDisposable
{
	private NotifyIcon? _notifyIcon;
	private readonly GameProcessService _gameProcessService;
	private readonly MainWindow _mainWindow;

	public TrayIconService(GameProcessService gameProcessService, MainWindow mainWindow)
	{
		_gameProcessService = gameProcessService;
		_mainWindow = mainWindow;

		try
		{
			var resourcesDir = Path.Combine(AppContext.BaseDirectory, "Resources");
			var iconPath = Path.Combine(resourcesDir, "tray.ico");

			_mainWindow.Log($"트레이 아이콘 초기화 중... 아이콘 경로: {iconPath}");

			_notifyIcon = new NotifyIcon
			{
				Icon = LoadIcon(iconPath, _mainWindow),
				Visible = true,
				Text = "KarmoHub"
			};

			var menu = new ContextMenuStrip();
			menu.Items.Add("KarmoHub 열기", null, (_, _) => ShowMainWindow());
			menu.Items.Add("종료", null, (_, _) => ExitApplication());
			_notifyIcon.ContextMenuStrip = menu;

			_notifyIcon.MouseUp += OnMouseUp;
			_mainWindow.Log("트레이 아이콘 초기화 완료.");
		}
		catch (Exception ex)
		{
			_mainWindow.Log($"트레이 아이콘 초기화 실패: {ex.Message}");
		}
	}

	private void OnMouseUp(object? sender, MouseEventArgs e)
	{
		if (e.Button == MouseButtons.Left)
		{
			ShowMainWindow();
		}
	}

	private void ShowMainWindow()
	{
		Application.Current?.Dispatcher?.BeginInvoke(new Action(() => _mainWindow.ShowMainWindow()));
	}

	private void ExitApplication()
	{
		if (_notifyIcon != null)
		{
			_notifyIcon.Visible = false;
			_notifyIcon.Dispose();
		}
		Application.Current.Shutdown();
	}

	public void Dispose()
	{
		if (_notifyIcon != null)
		{
			_notifyIcon.MouseUp -= OnMouseUp;
			_notifyIcon.Visible = false;
			_notifyIcon.Dispose();
		}
	}

	private static Icon LoadIcon(string icoPath, MainWindow mainWindow)
	{
		if (File.Exists(icoPath))
		{
			try
			{
				return new Icon(icoPath);
			}
			catch (Exception ex)
			{
				mainWindow.Log($"아이콘 파일 로드 실패: {ex.Message}");
			}
		}
		else
		{
			mainWindow.Log("아이콘 파일을 찾을 수 없어 기본 아이콘을 사용합니다.");
		}

		return SystemIcons.Application;
	}
}
