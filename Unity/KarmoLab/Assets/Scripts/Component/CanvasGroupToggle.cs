using UnityEngine;
using UnityEngine.UI;

public class CanvasGroupToggle : MonoBehaviour
{
	[SerializeField] private CanvasGroup canvasGroup;
	[SerializeField] private Toggle toggle;

	public void ToggleCanvasGroup()
	{
		canvasGroup.alpha = toggle.isOn ? 1 : 0;
		canvasGroup.blocksRaycasts = toggle.isOn;
		canvasGroup.interactable = toggle.isOn;
	}
}
