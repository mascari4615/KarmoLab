using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Core;
using KarmoToys.Common;

namespace KarmoToys.Main
{
    public class KarmoToysApp : MonoBehaviour
    {
        [SerializeField] private UIDocument _uiDocument;
        
        // 전역 접근 가능한 Toast 시스템
        public static ToastSystem Toast { get; private set; }

        private List<IFeature> _features = new();
        private Dictionary<Button, IFeature> _tabMap = new();
        private IFeature _currentFeature;

        private void Start()
        {
            if (_uiDocument == null) _uiDocument = GetComponent<UIDocument>();
            Initialize();
        }

        private void Initialize()
        {
            var root = _uiDocument.rootVisualElement;
            if (root == null) return;

            // 1. 공통 서비스 초기화
            Toast = new ToastSystem(root.Q("ToastContainer"));

            // 2. 피처 검색 및 초기화
            _features.Clear();
            _features.AddRange(GetComponentsInChildren<IFeature>());

            foreach (var feature in _features)
            {
                // 각 피처 초기화
                feature.Initialize(root);

                // 탭 버튼 바인딩
                if (!string.IsNullOrEmpty(feature.TabButtonName))
                {
                    var btn = root.Q<Button>(feature.TabButtonName);
                    if (btn != null)
                    {
                        _tabMap[btn] = feature;
                        btn.clicked += () => SelectTab(btn);
                    }
                    else
                    {
                        Debug.LogWarning($"[KarmoToys] Tab Button '{feature.TabButtonName}' not found for feature '{feature.FeatureName}'");
                    }
                }
            }

            // 3. 첫 번째 탭 선택 (기본값)
            if (_tabMap.Count > 0)
            {
                // Dictionary의 첫 번째 키를 가져오는 것은 순서가 보장되지 않으므로, Features 순서대로 찾음
                foreach(var feature in _features)
                {
                    var btn = root.Q<Button>(feature.TabButtonName);
                    if (btn != null && _tabMap.ContainsKey(btn))
                    {
                        SelectTab(btn);
                        break;
                    }
                }
            }

            // 환영 메시지
            Toast.Show("KarmoToys에 오신 것을 환영한다냥! 🎮", ToastType.Info);
        }

        private void SelectTab(Button selectedBtn)
        {
            if (!_tabMap.ContainsKey(selectedBtn)) return;

            var targetFeature = _tabMap[selectedBtn];
            if (_currentFeature == targetFeature) return;

            // 1. 모든 탭 비활성화 UI 처리
            foreach (var btn in _tabMap.Keys)
            {
                btn.RemoveFromClassList("selected");
                _tabMap[btn].OnDeselect();
            }

            // 2. 선택된 탭 활성화
            selectedBtn.AddToClassList("selected");
            targetFeature.OnSelect();
            _currentFeature = targetFeature;
        }
    }
}
