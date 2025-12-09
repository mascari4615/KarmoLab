using TMPro;
using UnityEngine;

namespace KarmoLab
{
	[DefaultExecutionOrder(-1000)]
	public class MLog : Singleton<MLog>
	{
		private static TMP_InputField inputFieldLog;
		private static TextMeshProUGUI textLog;

		protected override void Awake()
		{
			base.Awake();
			Init();
		}

		private void Init()
		{
			inputFieldLog = GameObject.Find("[InputField] Log").GetComponent<TMP_InputField>();
			textLog = GameObject.Find("[Text] Log").GetComponent<TextMeshProUGUI>();

			inputFieldLog.text = string.Empty;
			textLog.text = string.Empty;

			string awakeLog = "Program started. UwU...";
			Log(awakeLog);
		}

		public static void Log(string log)
		{
			Debug.Log(log);

			inputFieldLog.text += log + "\n";
			textLog.text += log + "\n";
		}
	}
}