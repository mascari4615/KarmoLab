using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoToys.Features.Companion
{
	/// <summary>
	/// Provides robust hit-testing for UI Toolkit elements in a transparent, click-through window.
	/// This bypasses Unity's standard Input System events which can fail when the window is unfocused or transparent.
	/// </summary>
	public static class TransparencyHitTest
	{
		/// <summary>
		/// Checks if the mouse (Win32 cursor) is physically over any visual element in the root.
		/// Returns the top-most element found, or null.
		/// mimics Physics2D.OverlapPoint but for UI VisualElements.
		/// </summary>
		public static VisualElement OverlapPoint(VisualElement root)
		{
			if (root == null) return null;

			// 1. Get Robust Mouse Position (Win32)
			Vector2 winPos = WindowTransparencyUtils.GetMousePosInWindow();

			// 2. Convert to Panel Logic Space (Proportional)
			float ratioX = winPos.x / Screen.width;
			float ratioY = winPos.y / Screen.height;

			float panelW = root.layout.width;
			float panelH = root.layout.height;

			if (panelW <= 0 || panelH <= 0) return null;

			Vector2 manualPanelPos = new Vector2(ratioX * panelW, ratioY * panelH);

			// 3. Iterate Children (Backwards = Top-most first)
			return FindTopMostElement(root, manualPanelPos);
		}

		private static VisualElement FindTopMostElement(VisualElement parent, Vector2 point)
		{
			if (parent.childCount > 0)
			{
				for (int i = parent.childCount - 1; i >= 0; i--)
				{
					VisualElement child = parent[i];

					// Skip hidden or un-layouted elements
					if (child.style.display == DisplayStyle.None) continue;
					// Optional: Check pickingMode? For now assume everything visible is clickable.

					// Recursively check children first (if you want deep picking)
					// But for now, let's just check direct children of root or leaf nodes?
					// Standard pick logic goes deep.

					bool contains = child.layout.Contains(point);

					// If container, check inside it?
					// For simple Companion app, usually we want the specific interactive element.

					// Simple implementation: Check child bounds.
					if (contains)
					{
						// If this child has children, we might want to drill down?
						// For now, let's return this child.
						return child;
					}
				}
			}
			return null;
		}
	}
}
