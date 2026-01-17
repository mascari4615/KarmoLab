namespace KarmoHub.Models;

public class GameItem
{
	public string Id { get; set; } = string.Empty;
	public string Name { get; set; } = string.Empty;
	public string Description { get; set; } = string.Empty;
	public string ExecutablePath { get; set; } = string.Empty; // 실행 파일 상대/절대 경로
	public string AppType { get; set; } = "Game"; // Game, Tool etc.
	public string DefaultVersion { get; set; } = "0.0.0"; // 설치된 버전
	public string LatestVersion { get; set; } = "0.0.0"; // 서버 최신 버전
	public string DownloadUrl { get; set; } = string.Empty; // 설치 파일(zip) 다운로드 URL

	// GitHub 리포지토리 정보 (업데이트 확인용)
	public string RepoOwner { get; set; } = string.Empty;
	public string RepoName { get; set; } = string.Empty;

	// 상태 도출 속성
	public GameStatus Status
	{
		get
		{
			if (DefaultVersion == "0.0.0")
			{
				// 다운로드 URL이 없으면 설치 불가 상태
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
}

public enum GameStatus
{
	NotInstalled,
	UpdateAvailable,
	Ready,
	Unavailable,
	InAction // 설치/업데이트 중
}
