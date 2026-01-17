using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace KarmoLab.KarmoEditor
{
	/// <summary>
	/// 툴바에 표시할 씬 정보를 저장하는 설정 파일입니다냥! 🐾
	/// </summary>
	[CreateAssetMenu(fileName = "ToolbarSceneConfig", menuName = "KarmoLab/Toolbar Scene Config")]
	public class ToolbarSceneConfig : ScriptableObject
	{
		[Header("Favorite Scenes")]
		[Tooltip("툴바 드롭다운에 항상 표시할 씬 목록입니다.")]
		public List<SceneAsset> FavoriteScenes = new List<SceneAsset>();

		[Header("Target Folders")]
		[Tooltip("내부의 모든 씬을 자동으로 툴바에 포함할 폴더 목록입니다.")]
		public List<DefaultAsset> TargetFolders = new List<DefaultAsset>();

		[Header("Settings")]
		[Tooltip("빌드 설정에 포함된 씬만 필터링할지 여부입니다.")]
		public bool ShowOnlyBuildSettingsScenes = false;

		/// <summary>
		/// 설정에 따라 유효한 모든 씬 경로를 반환합니다.
		/// </summary>
		public IEnumerable<string> GetTargetScenePaths()
		{
			var paths = new HashSet<string>();

			// 1. Favorite Scenes
			foreach (var scene in FavoriteScenes)
			{
				if (scene != null)
				{
					paths.Add(AssetDatabase.GetAssetPath(scene));
				}
			}

			// 2. Target Folders
			foreach (var folder in TargetFolders)
			{
				if (folder == null) continue;

				string folderPath = AssetDatabase.GetAssetPath(folder);
				if (!AssetDatabase.IsValidFolder(folderPath)) continue;

				string[] guids = AssetDatabase.FindAssets("t:Scene", new[] { folderPath });
				foreach (var guid in guids)
				{
					paths.Add(AssetDatabase.GUIDToAssetPath(guid));
				}
			}

			// 3. Filter by Build Settings if enabled
			if (ShowOnlyBuildSettingsScenes)
			{
				var buildScenes = new HashSet<string>(System.Linq.Enumerable.Select(EditorBuildSettings.scenes, s => s.path));
				paths.RemoveWhere(p => !buildScenes.Contains(p));
			}

			return paths;
		}
	}
}
