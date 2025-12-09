using System.Collections.Generic;
using System.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace KarmoLab
{
	[DefaultExecutionOrder(-900)]
	public class GameManager : MonoBehaviour
	{
		[SerializeField] private Button buttonPrefab;
		[SerializeField] private Transform buttonParent;

		private List<Content> contents = new();
		private Content currentContent = null;

		private void Awake()
		{
			Init();
		}

		private void Init()
		{
			InitializeContents();
			SetContent(contents[0]);
		}

		public void InitializeContents()
		{
			contents = transform.GetComponentsInChildren<Content>(true).ToList();

			foreach (Content content in contents)
			{
				content.Init();
				content.Hide();
			}

			for (int i = 0; i < contents.Count; i++)
			{
				MLog.Log($"Button {i} is set to {contents[i].name}");

				Button button = Instantiate(buttonPrefab, buttonParent);

				int index = i;
				button.onClick.AddListener(() =>
				{
					SetContent(contents[index]);
				});

				TextMeshProUGUI buttonText = button.GetComponentInChildren<TextMeshProUGUI>();
				buttonText.text = contents[i].name;
			}
		}

		private void SetContent(Content content)
		{
			currentContent?.Hide();
			currentContent = content;
			currentContent.Show();
		}
	}
}