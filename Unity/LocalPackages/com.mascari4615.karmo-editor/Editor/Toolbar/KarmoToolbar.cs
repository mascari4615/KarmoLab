using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.Toolbars;
using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoLab.KarmoEditor
{
	/// <summary>
	/// Unity 6.3+ 메인 툴바 확장 클래스
	/// </summary>
	/*
	 * [기술 참고 사항]
	 * 1. MainToolbarElementAttribute: 정적 메서드에 사용하여 툴바 요소 등록
	 * 2. IEnumerable<MainToolbarElement>: 단일 또는 여러 요소 한 번에 반환
	 * 3. MainToolbarDropdown/MainToolbarButton: 툴바 전용 UI 요소 사용
	 * 4. MainToolbar.Refresh(ID): 상태 변경 시 호출하여 툴바 UI 갱신
	 */
	public static class KarmoToolbar
	{
		public const string ID = "KarmoLab/SceneSelector";

		[MainToolbarElement(ID, defaultDockPosition = MainToolbarDockPosition.Middle)]
		static IEnumerable<MainToolbarElement> CreateSceneSelector()
		{
			string activeScene = EditorSceneManager.GetActiveScene().name;
			if (string.IsNullOrEmpty(activeScene)) activeScene = "No Scene";

			var content = new MainToolbarContent(activeScene, "설정된 씬 목록으로 빠르게 이동");
			content.image = EditorGUIUtility.IconContent("SceneAsset Icon").image as Texture2D;

			yield return new MainToolbarDropdown(content, ShowSceneMenu);
		}

		private static void ShowSceneMenu(Rect worldBound)
		{
			var menu = new GenericMenu();
			var config = FindConfig();

			if (config == null)
			{
				menu.AddDisabledItem(new GUIContent("Config not found! Create one via Assets menu."));
			}
			else
			{
				var paths = config.GetTargetScenePaths().OrderBy(p => p).ToList();

				if (paths.Count == 0)
				{
					menu.AddDisabledItem(new GUIContent("No scenes found in config."));
				}
				else
				{
					foreach (var path in paths)
					{
						string sceneName = Path.GetFileNameWithoutExtension(path);
						bool isActive = EditorSceneManager.GetActiveScene().path == path;

						menu.AddItem(new GUIContent(sceneName), isActive, () => OpenScene(path));
					}
				}
			}

			menu.DropDown(worldBound);
		}

		private static void OpenScene(string path)
		{
			if (EditorSceneManager.GetActiveScene().path == path) return;

			if (EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
			{
				EditorSceneManager.OpenScene(path);
				// 씬이 바뀌었으니 툴바 갱신
				MainToolbar.Refresh(ID);
			}
		}

		private static ToolbarSceneConfig FindConfig()
		{
			string[] guids = AssetDatabase.FindAssets("t:ToolbarSceneConfig");
			if (guids.Length > 0)
			{
				string path = AssetDatabase.GUIDToAssetPath(guids[0]);
				return AssetDatabase.LoadAssetAtPath<ToolbarSceneConfig>(path);
			}
			return null;
		}

		[MenuItem("KarmoLab/Create Toolbar Config")]
		public static void CreateConfig()
		{
			string path = "Assets/karmo-editor/Settings";
			if (!Directory.Exists(path)) Directory.CreateDirectory(path);

			string assetPath = $"{path}/ToolbarSceneConfig.asset";
			if (File.Exists(assetPath))
			{
				EditorUtility.DisplayDialog("KarmoLab", "Config already exists!", "OK");
				Selection.activeObject = AssetDatabase.LoadAssetAtPath<ToolbarSceneConfig>(assetPath);
				return;
			}

			var config = ScriptableObject.CreateInstance<ToolbarSceneConfig>();
			AssetDatabase.CreateAsset(config, assetPath);
			AssetDatabase.SaveAssets();

			EditorUtility.DisplayDialog("KarmoLab", "ToolbarSceneConfig created at " + assetPath, "Awesome!");
			Selection.activeObject = config;
		}
	}
}
