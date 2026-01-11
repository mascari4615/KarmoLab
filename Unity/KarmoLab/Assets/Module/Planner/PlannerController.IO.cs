using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace KarmoLab.Module.Planner
{
	public partial class PlannerController
	{
		private void LoadData()
		{
			if (File.Exists(_savePath))
			{
				try
				{
					string json = File.ReadAllText(_savePath);
					_data = JsonUtility.FromJson<PlannerData>(json);
				}
				catch { _data = new PlannerData(); }
			}
			else _data = new PlannerData();

			if (_data.Items == null) _data.Items = new List<TodoItem>();
			if (_data.TimeBlocks == null) _data.TimeBlocks = new List<TimeBlock>();
			if (_data.SecretNotes == null) _data.SecretNotes = new List<SecretNote>();
		}

		private void SaveData()
		{
			if (_data == null) return;
			string json = JsonUtility.ToJson(_data, true);
			File.WriteAllText(_savePath, json);
		}
	}
}