using System.IO;
using UnityEngine;
using KarmoToys.Common.Data;

namespace KarmoToys.Common
{
	public static class DataService
	{
		/// <summary>
		/// 데이터 로드
		/// </summary>
		public static KarmoToysData Load(string path)
		{
			if (File.Exists(path))
			{
				try
				{
					string json = File.ReadAllText(path);
					var data = JsonUtility.FromJson<KarmoToysData>(json);

					// Simple Migration Check: If data is null or Planner is default/empty but file exists?
					// JsonUtility might return object with null fields if mismatch.
					if (data == null) data = new KarmoToysData();
					if (data.Planner == null) data.Planner = new PlannerData();

					return data;
				}
				catch
				{
					Debug.LogWarning($"[DataService] Failed to load data from {path}. Creating new.");
					return new KarmoToysData();
				}
			}
			return new KarmoToysData();
		}

		/// <summary>
		/// 데이터 저장
		/// </summary>
		public static void Save(string path, KarmoToysData data)
		{
			if (data == null) return;

			try
			{
				string dir = Path.GetDirectoryName(path);
				if (!Directory.Exists(dir) && !string.IsNullOrEmpty(dir))
				{
					Directory.CreateDirectory(dir);
				}

				string json = JsonUtility.ToJson(data, true);
				File.WriteAllText(path, json);
			}
			catch (System.Exception ex)
			{
				Debug.LogError($"[DataService] Failed to save data: {ex.Message}");
			}
		}
	}
}
