namespace KarmoHub.Models;

public class GameItem
{
	public string Id { get; set; } = string.Empty;
	public string Name { get; set; } = string.Empty;
	public string Description { get; set; } = string.Empty;
	public string ExecutablePath { get; set; } = string.Empty; // 실행 파일 상대/절대 경로
	public string AppType { get; set; } = "Game"; // Game, Tool etc.
	public string Version { get; set; } = "1.0.0";
}
