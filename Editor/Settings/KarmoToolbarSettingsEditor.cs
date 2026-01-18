using UnityEditor;
using UnityEditorInternal;
using UnityEngine;

namespace KarmoLab.KarmoEditor.Settings
{
	[CustomEditor(typeof(KarmoToolbarSettings))]
	public class KarmoToolbarSettingsEditor : Editor
	{
		private ReorderableList _favoriteScenesList;
		private ReorderableList _targetFoldersList;

		private void OnEnable()
		{
			// Favorite Scenes
			_favoriteScenesList = new ReorderableList(serializedObject, serializedObject.FindProperty("FavoriteScenes"), true, true, true, true);
			_favoriteScenesList.drawHeaderCallback = rect => EditorGUI.LabelField(rect, "Favorite Scenes (Pinned to Toolbar)");
			_favoriteScenesList.drawElementCallback = (rect, index, isActive, isFocused) =>
			{
				var element = _favoriteScenesList.serializedProperty.GetArrayElementAtIndex(index);
				rect.y += 2;
				EditorGUI.PropertyField(new Rect(rect.x, rect.y, rect.width, EditorGUIUtility.singleLineHeight), element, GUIContent.none);
			};

			// Target Folders
			_targetFoldersList = new ReorderableList(serializedObject, serializedObject.FindProperty("TargetFolders"), true, true, true, true);
			_targetFoldersList.drawHeaderCallback = rect => EditorGUI.LabelField(rect, "Target Folders (Auto-include scenes)");
			_targetFoldersList.drawElementCallback = (rect, index, isActive, isFocused) =>
			{
				var element = _targetFoldersList.serializedProperty.GetArrayElementAtIndex(index);
				rect.y += 2;
				EditorGUI.PropertyField(new Rect(rect.x, rect.y, rect.width, EditorGUIUtility.singleLineHeight), element, GUIContent.none);
			};
		}

		public override void OnInspectorGUI()
		{
			serializedObject.Update();

			EditorGUILayout.Space(5);
			_favoriteScenesList.DoLayoutList();

			EditorGUILayout.Space(10);
			_targetFoldersList.DoLayoutList();

			EditorGUILayout.Space(5);
			EditorGUILayout.BeginVertical(EditorStyles.helpBox);
			// ShowOnlyBuildSettingsScenes는 단순 bool이므로 기본 PropertyField 사용
			EditorGUILayout.PropertyField(serializedObject.FindProperty("ShowOnlyBuildSettingsScenes"));
			EditorGUILayout.EndVertical();

			serializedObject.ApplyModifiedProperties();
		}
	}
}
