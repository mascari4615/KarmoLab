using System.Windows;
using Application = System.Windows.Application;

namespace KarmoHub.Services;

public enum AppTheme
{
	Dark,       // Obsidian Ember (Default)
	Monochrome, // Black & White Dark Mode
	Light       // Light Mode
}

public class ThemeService
{
	private const string DarkThemePath = "Resources/Themes/DarkTheme.xaml";
	private const string LightThemePath = "Resources/Themes/LightTheme.xaml";
	private const string MonochromeThemePath = "Resources/Themes/MonochromeTheme.xaml";

	public AppTheme CurrentTheme { get; private set; } = AppTheme.Dark;

	public void SetTheme(AppTheme theme)
	{
		string path = theme switch
		{
			AppTheme.Dark => DarkThemePath,
			AppTheme.Monochrome => MonochromeThemePath,
			AppTheme.Light => LightThemePath,
			_ => DarkThemePath
		};

		var newDict = new ResourceDictionary
		{
			Source = new Uri(path, UriKind.Relative)
		};

		// 기존 테마 사전 찾아서 교체
		var mergedDicts = Application.Current.Resources.MergedDictionaries;
		ResourceDictionary? oldDict = null;

		foreach (var dict in mergedDicts)
		{
			if (dict.Source != null && (
				dict.Source.OriginalString.Contains("DarkTheme.xaml") || 
				dict.Source.OriginalString.Contains("LightTheme.xaml") ||
				dict.Source.OriginalString.Contains("MonochromeTheme.xaml")))
			{
				oldDict = dict;
				break;
			}
		}

		if (oldDict != null)
		{
			mergedDicts.Remove(oldDict);
		}

		mergedDicts.Add(newDict);
		CurrentTheme = theme;
	}

    public void ToggleTheme()
    {
        // Cycle: Dark (Obsidian) -> Monochrome -> Light -> Dark
        var nextTheme = CurrentTheme switch
        {
            AppTheme.Dark => AppTheme.Monochrome,
            AppTheme.Monochrome => AppTheme.Light,
            AppTheme.Light => AppTheme.Dark,
            _ => AppTheme.Dark
        };
        SetTheme(nextTheme);
    }
}
