using System.Collections.Generic;
using KarmoHub.Models;

namespace KarmoHub.Services;

public class GameLibraryService
{
	public IEnumerable<GameItem> GetGames()
	{
		// TODO: 추후 JSON 파일(config)이나 웹 서버에서 목록을 받아오도록 변경
		return new List<GameItem>
		{
			new GameItem
			{
				Id = "karmo_lab",
				Name = "Karmo Lab",
				Description = "Unity 기반 실험실 프로젝트",
				ExecutablePath = "KarmoLab.exe", 
				AppType = "Game",
				Version = "0.1.0"
			},
			new GameItem
			{
				Id = "notepad",
				Name = "메모장 (테스트)",
				Description = "윈도우 메모장 실행 테스트",
				ExecutablePath = "notepad.exe",
				AppType = "Tool",
				Version = "Windows"
			}
		};
	}
}
