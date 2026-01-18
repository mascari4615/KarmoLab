using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace KarmoHub.Models;

public enum AppCategory
{
	Game,
	Tool,
	Package
}

public class GameItem : INotifyPropertyChanged
{
	private string _id = string.Empty;
	private string _name = string.Empty;
	private string _description = string.Empty;
	private string _executablePath = string.Empty;
	private string _appType = "Game";
	private AppCategory _category = AppCategory.Game;
	private string _defaultVersion = "0.0.0";
	private string _latestVersion = "0.0.0";
	private string _downloadUrl = string.Empty;

	public string Id { get => _id; set { _id = value; OnPropertyChanged(); } }
	public string Name { get => _name; set { _name = value; OnPropertyChanged(); } }
	public string Description { get => _description; set { _description = value; OnPropertyChanged(); } }
	public string ExecutablePath { get => _executablePath; set { _executablePath = value; OnPropertyChanged(); } }
	public string AppType { get => _appType; set { _appType = value; OnPropertyChanged(); } }
	public AppCategory Category { get => _category; set { _category = value; OnPropertyChanged(); OnPropertyChanged(nameof(IsManageable)); OnPropertyChanged(nameof(CanShowManagementButtons)); } }
	
	public string DefaultVersion 
	{ 
		get => _defaultVersion; 
		set 
		{ 
			_defaultVersion = value; 
			OnPropertyChanged(); 
			OnPropertyChanged(nameof(Status)); 
			OnPropertyChanged(nameof(ActionButtonText)); 
			OnPropertyChanged(nameof(IsInstalled)); 
			OnPropertyChanged(nameof(CanShowManagementButtons)); 
		} 
	}
	
	public string LatestVersion 
	{ 
		get => _latestVersion; 
		set 
		{ 
			_latestVersion = value; 
			OnPropertyChanged(); 
			OnPropertyChanged(nameof(Status)); 
			OnPropertyChanged(nameof(ActionButtonText)); 
		} 
	}
	
	public string DownloadUrl { get => _downloadUrl; set { _downloadUrl = value; OnPropertyChanged(); OnPropertyChanged(nameof(Status)); } }

	public string RepoOwner { get; set; } = string.Empty;
	public string RepoName { get; set; } = string.Empty;

	public GameStatus Status
	{
		get
		{
			if (DefaultVersion == "0.0.0")
			{
				if (string.IsNullOrEmpty(DownloadUrl)) return GameStatus.Unavailable;
				return GameStatus.NotInstalled;
			}
			if (DefaultVersion != LatestVersion && LatestVersion != "0.0.0") return GameStatus.UpdateAvailable;
			return GameStatus.Ready;
		}
	}

	public string ActionButtonText
	{
		get
		{
			return Status switch
			{
				GameStatus.NotInstalled => "설치",
				GameStatus.UpdateAvailable => "업데이트",
				GameStatus.Ready => "실행",
				GameStatus.Unavailable => "준비 안 됨",
				_ => "대기"
			};
		}
	}

	public bool IsManageable => Category != AppCategory.Package;
	public bool IsInstalled => DefaultVersion != "0.0.0";
	public bool CanShowManagementButtons => IsManageable && IsInstalled;

	public event PropertyChangedEventHandler? PropertyChanged;
	protected void OnPropertyChanged([CallerMemberName] string? name = null)
	{
		PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
	}
}

public enum GameStatus
{
	NotInstalled,
	UpdateAvailable,
	Ready,
	Unavailable,
	InAction // 설치/업데이트 중
}
