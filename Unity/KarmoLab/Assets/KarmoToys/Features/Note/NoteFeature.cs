using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Core;
using KarmoToys.Main;
using KarmoToys.Common;
using KarmoToys.Common.Data;
using KarmoToys.Features.QuestBoard; // If needed, but NoteFeature usually doesn't need this
// Wait, NoteFeature uses NoteData which is in KarmoToys.Features.Note.
// It is already in that namespace.
// But KarmoToysData uses NoteData from KarmoToys.Features.Note.


namespace KarmoToys.Features.Note
{
	[AddComponentMenu("KarmoLab/Features/Note")]
	public class NoteFeature : FeatureBase
	{
		public override string FeatureName => Define.FeatureNote;
		public override string TabButtonName => Define.TabSecret;

		private TextField _secProblem, _secWhy, _secSolution;
		private Button _addSecBtn;
		private VisualElement _secList;

		public override void Initialize(VisualElement root)
		{
			ViewContainer = root.Q("ViewSecret");

			_secProblem = root.Q<TextField>("SecretProblem");
			_secWhy = root.Q<TextField>("SecretWhy");
			_secSolution = root.Q<TextField>("SecretSolution");
			_addSecBtn = root.Q<Button>("AddSecretBtn");
			_secList = root.Q("SecretList");

			if (_addSecBtn != null) _addSecBtn.clicked += AddSecretNote;
		}

		public override void OnSelect()
		{
			base.OnSelect();
			RefreshSecretNotes();
		}

		private void AddSecretNote()
		{
			if (_secProblem == null || string.IsNullOrWhiteSpace(_secProblem.value)) return;

			NoteData data = KarmoToysApp.Instance.Data?.Note;
			if (data == null) return;

			data.SecretNotes.Add(new SecretNote(_secProblem.value, _secWhy.value, _secSolution.value));

			// Clear inputs
			_secProblem.value = "";
			_secWhy.value = "";
			_secSolution.value = "";

			KarmoToysApp.Instance.SaveData();
			RefreshSecretNotes();
		}

		private void RefreshSecretNotes()
		{
			if (_secList == null) return;
			_secList.Clear();

			NoteData data = KarmoToysApp.Instance.Data?.Note;
			if (data == null) return;

			foreach (SecretNote note in data.SecretNotes.OrderByDescending(n => n.DateString))
			{
				VisualElement item = new VisualElement();
				item.AddToClassList("secret-item");

				Label title = new Label($"[{note.DateString}] {note.Problem}");
				title.style.unityFontStyleAndWeight = FontStyle.Bold;
				title.style.color = new StyleColor(new Color(0.85f, 0.7f, 1f));

				Label reason = new Label($"Why: {note.Why}");
				reason.style.fontSize = 12;
				reason.style.color = Color.gray;

				Label sol = new Label($"Solution: {note.Solution}");
				sol.style.whiteSpace = WhiteSpace.Normal;
				sol.style.marginTop = 5;

				item.Add(title);
				item.Add(reason);
				item.Add(sol);

				_secList.Add(item);
			}
		}
	}
}
