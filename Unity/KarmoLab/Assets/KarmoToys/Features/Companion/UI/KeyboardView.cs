using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Features.Companion.Data;

namespace KarmoToys.Features.Companion.UI
{
    [UxmlElement]
    public partial class KeyboardView : VisualElement
    {
        // UxmlFactory removed as it is replaced by [UxmlElement]

        private readonly Dictionary<int, VisualElement> _keyMap = new Dictionary<int, VisualElement>();
        private KeyboardLayoutData _currentData;
        
        public KeyboardView()
        {
            // Default Constructor for UXML
            AddToClassList("keyboard-container");
            pickingMode = PickingMode.Ignore;
        }

        public void Initialize(KeyboardLayoutData data)
        {
            if (data == null)
            {
                Debug.LogError("[KeyboardView] Layout Data is null!");
                return;
            }

            _currentData = data;
            Clear();
            _keyMap.Clear();

            LoadStyleSheet();
            BuildLayout();
        }

        private void LoadStyleSheet()
        {
            var sheet = Resources.Load<StyleSheet>("UI/KeyboardStyles");
            if (sheet != null)
            {
                styleSheets.Add(sheet);
            }
            else
            {
                Debug.LogWarning("[KeyboardView] Could not find UI/KeyboardStyles.uss in Resources");
            }
        }

        private void BuildLayout()
        {
            foreach (var rowData in _currentData.Rows)
            {
                VisualElement rowEl = new VisualElement();
                rowEl.AddToClassList("keyboard-row");
                rowEl.pickingMode = PickingMode.Ignore; // Ensure rows don't block mouse
                
                // Row Height
                rowEl.style.height = rowData.Height * _currentData.BaseKeySize;
                rowEl.style.marginBottom = rowData.MarginBottom * _currentData.BaseKeySize;

                foreach (var keyData in rowData.Keys)
                {
                    VisualElement keyEl = CreateKeyElement(keyData);
                    rowEl.Add(keyEl);

                    // Map VkCode for O(1) access
                    if (!_keyMap.ContainsKey(keyData.VkCode))
                    {
                        _keyMap.Add(keyData.VkCode, keyEl);
                    }
                }
                Add(rowEl);
            }
        }

        private VisualElement CreateKeyElement(KeyDefinition key)
        {
            VisualElement k = new VisualElement();
            k.AddToClassList("key");
            k.pickingMode = PickingMode.Ignore;
            if (key.IsModifier) k.AddToClassList("modifier");
            if (!string.IsNullOrEmpty(key.CssClass)) k.AddToClassList(key.CssClass);

            // Size & Spacing
            k.style.width = key.Width * _currentData.BaseKeySize;
            // Height is handled by parent row's flex or explicit height, but consistent with 1U base
            // actually usually key height is 1U unless specified otherwise.
            // For simplicity, let's say key fills the row height.

            if (key.SpacingLeft > 0)
            {
                k.style.marginLeft = key.SpacingLeft * _currentData.BaseKeySize;
            }
            k.style.marginRight = _currentData.KeySpacing;

            Label l = new Label(key.Label);
            l.pickingMode = PickingMode.Ignore;
            k.Add(l);

            return k;
        }

        // Public API for Controllers
        public VisualElement GetKeyElement(int vkCode)
        {
            if (_keyMap.TryGetValue(vkCode, out var el)) return el;
            return null;
        }
        
        public void SetKeyActive(int vkCode, bool active)
        {
            var el = GetKeyElement(vkCode);
            if (el != null)
            {
                if (active) el.AddToClassList("active");
                else el.RemoveFromClassList("active");
            }
        }
    }
}
