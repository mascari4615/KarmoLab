using Microsoft.Win32;

namespace KarmoHub.Services;

public class StartupService
{
	private const string AppName = "KarmoHub";

	public static void RegisterStartup(string exePath)
	{
		try
		{
			var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true);
			key?.SetValue(AppName, exePath);
		}
		catch
		{
			// 권한 부족 등 예외 무시
		}
	}

	public static void UnregisterStartup()
	{
		try
		{
			var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true);
			key?.DeleteValue(AppName, false);
		}
		catch
		{
			// 키가 없거나 권한 부족 예외 무시
		}
	}
}
