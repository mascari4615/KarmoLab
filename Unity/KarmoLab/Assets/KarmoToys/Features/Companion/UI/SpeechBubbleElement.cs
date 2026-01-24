using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoToys.Features.Companion
{
	public class SpeechBubbleElement : VisualElement
	{
		private Label _textLabel;
		private VisualElement _bubbleContainer;
		private VisualElement _tail;

		public SpeechBubbleElement()
		{
			// 1. Setup Container Style
			_bubbleContainer = new VisualElement();
			_bubbleContainer.style.backgroundColor = new Color(1f, 1f, 1f, 0.95f);
			_bubbleContainer.style.borderTopLeftRadius = 16;
			_bubbleContainer.style.borderTopRightRadius = 16;
			_bubbleContainer.style.borderBottomLeftRadius = 16;
			_bubbleContainer.style.borderBottomRightRadius = 16;
			_bubbleContainer.style.paddingTop = 8;
			_bubbleContainer.style.paddingBottom = 8;
			_bubbleContainer.style.paddingLeft = 12;
			_bubbleContainer.style.paddingRight = 12;
			_bubbleContainer.style.alignSelf = Align.FlexStart; // Size to fit content

			// Shadow & Border
			_bubbleContainer.style.borderBottomColor = new Color(0, 0, 0, 0.1f);
			_bubbleContainer.style.borderBottomWidth = 2;
			_bubbleContainer.style.borderRightColor = new Color(0, 0, 0, 0.1f);
			_bubbleContainer.style.borderRightWidth = 2;

			// 2. Setup Label
			_textLabel = new Label();
			_textLabel.style.color = new Color(0.2f, 0.2f, 0.2f, 1f);
			_textLabel.style.fontSize = 14;
			_textLabel.style.unityFontStyleAndWeight = FontStyle.Bold;
			_textLabel.style.whiteSpace = WhiteSpace.Normal; // Allow wrapping if needed? Usually single line for bubble.

			_bubbleContainer.Add(_textLabel);

			// 3. Setup Tail (Triangle ish)
			_tail = new VisualElement();
			_tail.style.width = 10;
			_tail.style.height = 10;
			_tail.style.backgroundColor = new Color(1f, 1f, 1f, 0.95f);
			_tail.style.position = Position.Absolute;
			_tail.style.bottom = -5;
			_tail.style.left = 20;
			_tail.style.rotate = new Rotate(45); // Rotate to make it look like a tail

			Add(_bubbleContainer);
			Add(_tail);

			// Default hidden
			style.position = Position.Absolute;
			style.opacity = 0;
			style.transitionDuration = new System.Collections.Generic.List<TimeValue> { new(0.2f) };
			style.transitionProperty = new System.Collections.Generic.List<StylePropertyName> { new("opacity"), new("scale") };
			style.transformOrigin = new TransformOrigin(0, 100, 0); // Bottom-Left origin for pop effect
			style.scale = new Scale(Vector3.zero);
		}

		public void Show(string text, float duration)
		{
			_textLabel.text = text;

			// Pop Animation
			style.opacity = 1;
			style.scale = new Scale(Vector3.one);

			// Hide after duration
			// Note: The Manager (CompanionFeature) handles the hiding logic via _bubbleHideTime.
			// We just ensure the visual state is set to show here.
		}

		public void Hide()
		{
			style.opacity = 0;
			style.scale = new Scale(Vector3.zero);
		}
	}
}
