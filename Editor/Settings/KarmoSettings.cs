using UnityEngine;
using System;
using System.Collections.Generic;
using KarmoLab.KarmoEditor;

namespace KarmoLab.KarmoEditor.Settings
{
	[CreateAssetMenu(fileName = nameof(KarmoSettings), menuName = Define.CreateAssetMenuSettings + "/" + nameof(KarmoSettings))]
	public class KarmoSettings : ScriptableObject
	{
		[Header("Mutex Settings")]
		public string[] MutexNames;

		[Header("Reset Fields (Reflection)")]
		public List<FieldResetInfo> FieldsToReset;

		[Serializable]
		public class FieldResetInfo
		{
			public string FullTypeName; // e.g. KarmoToys.Main.KarmoToysApp, Assembly-CSharp
			public string FieldName;    // e.g. _appMutex
		}
	}
}
