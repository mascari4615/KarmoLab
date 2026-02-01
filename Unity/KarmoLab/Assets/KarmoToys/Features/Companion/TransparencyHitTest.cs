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

					// Skip hidden elements
					if (child.resolvedStyle.display == DisplayStyle.None) continue;

					// Recursive Search: Depth-first, backwards (top-most first)
					// We ALWAYS recurse into children, even if this parent ignores picking,
					// because children might have PickingMode.Position.
					VisualElement found = FindTopMostElement(child, point);
					if (found != null) return found;

					// If no interactive child found, check this element itself
					if (child.pickingMode != PickingMode.Ignore && child.worldBound.Contains(point))
					{
						return child;
					}
				}
			}
			return null;
		}
	}
}
