using UnityEditor;
using UnityEngine;

namespace KarmoToys.Main.Editor
{
	public static class KarmoToysEditorMenu
	{
		[MenuItem("KarmoLab/KarmoToys/Select Settings ⚙️", false, 0)]
		public static void SelectSettings()
		{
			string[] guids = AssetDatabase.FindAssets("t:KarmoToysSettings");
			if (guids.Length > 0)
			{
				string path = AssetDatabase.GUIDToAssetPath(guids[0]);
				Object settings = AssetDatabase.LoadAssetAtPath<Object>(path);
				Selection.activeObject = settings;
				EditorGUIUtility.PingObject(settings);
			}
			else
			{
				if (EditorUtility.DisplayDialog("Settings Not Found", 
					"KarmoToysSettings 에셋을 찾을 수 없습니다. 새로 생성하시겠습니까?", "생성", "취소"))
				{
					CreateSettingsAsset();
				}
			}
		}

		private static void CreateSettingsAsset()
		{
			KarmoToys.Common.KarmoToysSettings asset = ScriptableObject.CreateInstance<KarmoToys.Common.KarmoToysSettings>();
			string path = "Assets/KarmoToysSettings.asset";
			AssetDatabase.CreateAsset(asset, path);
			AssetDatabase.SaveAssets();

			EditorUtility.FocusProjectWindow();
			Selection.activeObject = asset;
			EditorGUIUtility.PingObject(asset);
		}
	}
}
