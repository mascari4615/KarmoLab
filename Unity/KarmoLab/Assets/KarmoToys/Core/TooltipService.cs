using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoToys.Core
{
	/// <summary>
	/// UI Toolkit의 VisualElement.tooltip 속성을 런타임에서 자동으로 표시해주는 전역 서비스다냥! 🐾
	/// </summary>
	public class TooltipService
	{
		private readonly VisualElement _tooltipContainer;
		private readonly Label _tooltipLabel;
		private readonly VisualElement _root;

		public TooltipService(VisualElement root)
		{
			_root = root;

			_tooltipContainer = new VisualElement();
			_tooltipContainer.name = "GlobalTooltip";
			_tooltipContainer.pickingMode = PickingMode.Ignore;
			_tooltipContainer.style.position = Position.Absolute;
			_tooltipContainer.style.display = DisplayStyle.None;
			_tooltipContainer.style.visibility = Visibility.Hidden;

			_tooltipLabel = new Label();
			_tooltipLabel.name = "GlobalTooltipLabel";
			_tooltipContainer.Add(_tooltipLabel);

			_root.Add(_tooltipContainer);

			_root.RegisterCallback<PointerOverEvent>(OnPointerOver, TrickleDown.NoTrickleDown);
			_root.RegisterCallback<PointerOutEvent>(OnPointerOut, TrickleDown.NoTrickleDown);
			_root.RegisterCallback<PointerMoveEvent>(OnPointerMove, TrickleDown.NoTrickleDown);
		}

		private void OnPointerOver(PointerOverEvent evt)
		{
			var target = evt.target as VisualElement;
			if (target == null) return;

			var tooltipText = FindTooltipText(target);
			if (string.IsNullOrEmpty(tooltipText))
			{
				HideTooltip();
				return;
			}

			ShowTooltip(tooltipText, evt.position);
		}

		private void OnPointerOut(PointerOutEvent evt)
		{
			HideTooltip();
		}

		private void OnPointerMove(PointerMoveEvent evt)
		{
			if (_tooltipContainer.style.display == DisplayStyle.Flex)
			{
				UpdatePosition(evt.position);
			}
		}

		private string FindTooltipText(VisualElement element)
		{
			var curr = element;
			while (curr != null && curr != _root)
			{
				if (!string.IsNullOrEmpty(curr.tooltip))
					return curr.tooltip;
				curr = curr.parent;
			}
			return null;
		}

		private void ShowTooltip(string text, Vector2 position)
		{
			_tooltipLabel.text = text;
			_tooltipContainer.style.display = DisplayStyle.Flex;
			_tooltipContainer.style.visibility = Visibility.Visible;
			_tooltipContainer.style.opacity = 1f;
			_tooltipLabel.style.scale = new StyleScale(new Scale(Vector3.one));

			_tooltipContainer.BringToFront();
			UpdatePosition(position);
		}

		private void HideTooltip()
		{
			_tooltipContainer.style.display = DisplayStyle.None;
			_tooltipContainer.style.visibility = Visibility.Hidden;
		}

		private void UpdatePosition(Vector2 mousePosition)
		{
			_tooltipContainer.style.left = mousePosition.x + 15;
			_tooltipContainer.style.top = mousePosition.y + 15;
		}
	}
}
