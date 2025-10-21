// ...existing code...
using UnityEngine;
using UnityEngine.UI;

public class ButtonOpenWeb : MonoBehaviour
{
	[SerializeField] private Button openWebButton;
	[field: SerializeField] public string Url { get; private set; } = "https://mascari4615.github.io/";

	private void Start()
	{
		openWebButton.onClick.AddListener(() => OpenWebPage(Url));
	}

	private void OpenWebPage(string url)
	{
		Application.OpenURL(url);
	}
}
