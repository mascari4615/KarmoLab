using System;
using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoToys.Features.ProjectManager.Timeline
{
    public class SidebarReorderManipulator : MouseManipulator
    {
        private float _rowHeight;
        private int _startIndex;
        private Action<int, int> _onReorder;

        private bool _isDragging;
        private Vector2 _startMousePos;
        private float _startTop;
        private VisualElement _dragElement;

        public SidebarReorderManipulator(float rowHeight, int startIndex, Action<int, int> onReorder)
        {
            _rowHeight = rowHeight;
            _startIndex = startIndex;
            _onReorder = onReorder;
            activators.Add(new ManipulatorActivationFilter { button = MouseButton.LeftMouse });
        }

        protected override void RegisterCallbacksOnTarget()
        {
            target.RegisterCallback<MouseDownEvent>(OnMouseDown);
            target.RegisterCallback<MouseMoveEvent>(OnMouseMove);
            target.RegisterCallback<MouseUpEvent>(OnMouseUp);
        }

        protected override void UnregisterCallbacksFromTarget()
        {
            target.UnregisterCallback<MouseDownEvent>(OnMouseDown);
            target.UnregisterCallback<MouseMoveEvent>(OnMouseMove);
            target.UnregisterCallback<MouseUpEvent>(OnMouseUp);
        }

        private void OnMouseDown(MouseDownEvent evt)
        {
            if (_isDragging) return;

            _isDragging = true;
            _dragElement = target as VisualElement;
            _startMousePos = evt.mousePosition; // Global
            _startTop = _dragElement.resolvedStyle.top;

            _dragElement.CaptureMouse();
            _dragElement.BringToFront(); // Visual feedback
            
            // Highlight
            _dragElement.style.backgroundColor = new StyleColor(new Color(1, 1, 1, 0.1f));
            
            evt.StopPropagation();
        }

        private void OnMouseMove(MouseMoveEvent evt)
        {
            if (!_isDragging || !target.HasMouseCapture()) return;

            float deltaY = evt.mousePosition.y - _startMousePos.y;
            _dragElement.style.top = _startTop + deltaY;
        }

        private void OnMouseUp(MouseUpEvent evt)
        {
            if (!_isDragging) return;

            _isDragging = false;
            _dragElement.ReleaseMouse();
            
            // Calculate final index
            // Current Top / RowHeight
            float currentTop = _dragElement.style.top.value.value;
            int newIndex = Mathf.RoundToInt(currentTop / _rowHeight);

            // Bounds check will be handled by callback logic or here
            
            _onReorder?.Invoke(_startIndex, newIndex);
            
            // Visual reset is handled by Re-render in parent
            evt.StopPropagation();
        }
    }
}
