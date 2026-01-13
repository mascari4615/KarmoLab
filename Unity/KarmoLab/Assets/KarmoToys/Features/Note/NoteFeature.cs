using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Core;
using KarmoToys.Main;
using KarmoToys.Common;
using KarmoToys.Common.Data;

namespace KarmoToys.Features.Note
{
    public class NoteFeature : FeatureBase
    {
        public override string FeatureName => Define.FeatureNote; // "Note"
        public override string TabButtonName => Define.TabSecret; // "TabSecret"

        private TextField _secProblem, _secWhy, _secSolution;
        private Button _addSecBtn;
        private VisualElement _secList; // or ScrollView? PlannerController used VisualElement (root.Q("SecretList"))

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
            
            var data = KarmoToysApp.Instance.Data?.Planner;
            if (data == null) return;

            data.SecretNotes.Add(new SecretNote(_secProblem.value, _secWhy.value, _secSolution.value));
            
            // Clear inputs
            _secProblem.value = ""; 
            if (_secWhy != null) _secWhy.value = ""; 
            if (_secSolution != null) _secSolution.value = "";

            KarmoToysApp.Instance.SaveData();
            RefreshSecretNotes();
        }

        private void RefreshSecretNotes()
        {
            if (_secList == null) return;
            _secList.Clear();

            var data = KarmoToysApp.Instance.Data?.Planner;
            if (data == null) return;

            foreach (var note in data.SecretNotes.OrderByDescending(n => n.DateString))
            {
                var item = new VisualElement();
                item.AddToClassList("secret-item");

                var title = new Label($"[{note.DateString}] {note.Problem}");
                title.style.unityFontStyleAndWeight = FontStyle.Bold;
                title.style.color = new StyleColor(new Color(0.85f, 0.7f, 1f));
                
                var reason = new Label($"Why: {note.Why}");
                reason.style.fontSize = 12; 
                reason.style.color = Color.gray;
                
                var sol = new Label($"Solution: {note.Solution}");
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
