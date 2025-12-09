using UnityEngine;

public class ButtonOpenWebGlue : MonoBehaviour
{
	[SerializeField] private ButtonOpenWeb buttonOpenWebPrefab;
	[SerializeField] private WebData webData;

	private void Start()
	{
		foreach (WebPage page in webData.Pages)
		{
			ButtonOpenWeb buttonInstance = Instantiate(buttonOpenWebPrefab, transform);
			buttonInstance.Url = page.Url;
			buttonInstance.SetText(page.Title);
		}
	}
}
