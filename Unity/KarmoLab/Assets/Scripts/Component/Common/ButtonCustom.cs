// ...existing code...
using TMPro;
using UnityEngine;
using UnityEngine.UI;

[RequireComponent(typeof(Button))]
public class ButtonCustom : MonoBehaviour
{
	[SerializeField] protected Button button;
	[SerializeField] private TextMeshProUGUI buttonText;

	public void SetText(string text)
	{
		if (buttonText != null)
		{
			buttonText.text = text;
		}
	}
}
