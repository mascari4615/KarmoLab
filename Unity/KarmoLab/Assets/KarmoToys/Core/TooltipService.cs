using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoToys.Core
{
	/// <summary>
	/// UI Toolkit의 VisualElement.tooltip 속성을 런타임에서 자동 표시하는 전역 서비스. 🐾
	/// </summary>
	public class TooltipService
	{
		private readonly VisualElement _root;
		private readonly Label _tooltipLabel;
		private readonly VisualElement _tooltipContainer;

		private bool _isVisible;

		public TooltipService(VisualElement root)
		{
			_root = root;

			_tooltipContainer = root.Q("TooltipContainer");
			_tooltipLabel = root.Q<Label>("TooltipLabel");

			if (_tooltipContainer != null)
			{
				_tooltipContainer.pickingMode = PickingMode.Ignore;
				_tooltipContainer.style.display = DisplayStyle.None;
			}

			_root.RegisterCallback<PointerMoveEvent>(OnPointerMove, TrickleDown.TrickleDown);
		}

		private void OnPointerMove(PointerMoveEvent evt)
		{
			if (_tooltipContainer == null || _tooltipLabel == null) return;

			VisualElement element = evt.target as VisualElement;
			VisualElement tooltipElement = null;

			// Find nearest ancestor with tooltip
			while (element != null && element != _root)
			{
				if (!string.IsNullOrEmpty(element.tooltip))
				{
					tooltipElement = element;
					break;
				}
				element = element.parent;
			}

			if (tooltipElement != null)
			{
				_tooltipLabel.text = tooltipElement.tooltip;
				_tooltipContainer.style.display = DisplayStyle.Flex;

				// Position tooltip near mouse
				_tooltipContainer.style.left = evt.localPosition.x + 15;
				_tooltipContainer.style.top = evt.localPosition.y + 15;

				// Boundary check
				_tooltipContainer.RegisterCallback<GeometryChangedEvent>(OnGeometryChanged);
			}
			else
			{
				_tooltipContainer.style.display = DisplayStyle.None;
			}
		}

		private void OnGeometryChanged(GeometryChangedEvent evt)
		{
			VisualElement container = evt.target as VisualElement;
			if (container == null) return;

			float right = container.layout.xMax;
			float bottom = container.layout.yMax;

			if (right > _root.layout.width)
			{
				container.style.left = _root.layout.width - container.layout.width - 5;
			}
			if (bottom > _root.layout.height)
			{
				container.style.top = _root.layout.height - container.layout.height - 5;
			}
			container.UnregisterCallback<GeometryChangedEvent>(OnGeometryChanged);
		}
	}
}
