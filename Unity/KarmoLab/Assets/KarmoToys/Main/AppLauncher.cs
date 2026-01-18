using System;
using UnityEngine;
using KarmoToys.Common;

namespace KarmoToys.Main
{
	/// <summary>
	/// 앱의 실행 및 중복 방지(Mutex)를 관리하는 서비스
	/// </summary>
	public static class AppLauncher
	{
		private static System.Threading.Mutex _appMutex;

#pragma warning disable CS0162 // Unreachable code detected
		public static void CheckSingleInstance(AppMode mode)
		{
#if UNITY_EDITOR
			// 에디터에서는 중복 실행 체크를 수행하지 않음
			return;
#endif
			string mutexName = $"Global\\KarmoLab_{mode}";
			bool createdNew;

			try
			{
				_appMutex = new System.Threading.Mutex(true, mutexName, out createdNew);
			}
			catch (Exception ex)
			{
				Debug.LogError($"[AppLauncher] Mutex creation failed: {ex}");
				createdNew = true;
			}

			if (!createdNew)
			{
				Debug.LogError($"[AppLauncher] Instance already running for mode: {mode}. Quitting.");
				Application.Quit();
			}
		}
#pragma warning restore CS0162
	}
}
