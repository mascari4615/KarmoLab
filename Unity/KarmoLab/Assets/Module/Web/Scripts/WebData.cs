using UnityEngine;

[System.Serializable]
public struct WebPage
{
	public string Title;
	public string Url;
}

[CreateAssetMenu(fileName = "WebData", menuName = "Data/Web/WebData")]
public class WebData : ScriptableObject
{
	[field: SerializeField] public WebPage[] Pages { get; private set; }
}
