// ...existing code...
using UnityEngine;
using UnityEngine.UI;

public class ButtonOpenWeb : ButtonCustom
{
	[field: SerializeField] public string Url { get; set; } = "https://mascari4615.github.io/";

	private void Start()
	{
		button.onClick.AddListener(() => OpenWebPage(Url));
	}

	private void OpenWebPage(string url)
	{
		Application.OpenURL(url);
	}
}
