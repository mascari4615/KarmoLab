using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoToys.Features.ProjectManager.Whiteboard
{
	[UxmlElement]
	public partial class GridBackground : VisualElement
	{
		// Grid Settings
		private float _baseGridSize = 50f;
		private Color _lineColor = new Color(0.3f, 0.3f, 0.3f, 1f);
		private Color _thickLineColor = new Color(0.15f, 0.15f, 0.15f, 1f); // Darker/distinct for chunks

		private Vector3 _panOffset;
		private float _currentScale = 1.0f;

		public GridBackground()
		{
			pickingMode = PickingMode.Ignore;
			style.position = Position.Absolute;
			style.left = 0; style.top = 0; style.right = 0; style.bottom = 0;

			generateVisualContent += OnGenerateVisualContent;
		}

		public void UpdateView(Vector3 pan, float scale)
		{
			_panOffset = pan;
			_currentScale = scale;
			MarkDirtyRepaint();
		}

		private const float CanvasSize = 100000f;

		private void OnGenerateVisualContent(MeshGenerationContext mgc)
		{
			var painter = mgc.painter2D;
			var rect = contentRect;

			// Calculate Efficient Grid Spacing (LOD)
			float visualSize = _baseGridSize * _currentScale;
			float stepMultiplier = 1.0f;
			while (visualSize * stepMultiplier < 20f) stepMultiplier *= 5.0f;

			float spacing = _baseGridSize * stepMultiplier;
			float scaledSpacing = spacing * _currentScale;

			painter.lineWidth = 1.0f;
			painter.strokeColor = _lineColor;
			painter.BeginPath();

			// Canvas Bounds in Screen Space
			float canvasX = _panOffset.x;
			float canvasY = _panOffset.y;
			float canvasW = CanvasSize * _currentScale;
			float canvasH = CanvasSize * _currentScale;

			// Intersection with Viewport (Screen)
			// We only draw where Canvas overlaps Screen.
			float drawStartX = Mathf.Max(0, canvasX);
			float drawStartY = Mathf.Max(0, canvasY);
			float drawEndX = Mathf.Min(rect.width, canvasX + canvasW);
			float drawEndY = Mathf.Min(rect.height, canvasY + canvasH);

			// If no overlap, don't draw
			if (drawEndX <= drawStartX || drawEndY <= drawStartY) return;

			// 1. Draw Canvas Background (Conceptually #202020)
			// We draw this MANUALLY so it is clipped exactly same as the grid.
			// Z-Order: Background -> Lines -> Nodes (Separate Element)

			var bgMesh = painter; // Use same painter
			bgMesh.fillColor = new Color(0.125f, 0.125f, 0.125f, 1f); // #202020
			bgMesh.BeginPath();
			bgMesh.MoveTo(new Vector2(drawStartX, drawStartY));
			bgMesh.LineTo(new Vector2(drawEndX, drawStartY));
			bgMesh.LineTo(new Vector2(drawEndX, drawEndY));
			bgMesh.LineTo(new Vector2(drawStartX, drawEndY));
			bgMesh.ClosePath();
			bgMesh.Fill();

			// 2. Draw Grid Lines
			painter.lineWidth = 1.0f;
			painter.strokeColor = _lineColor;
			painter.BeginPath();

			// X Lines (Vertical)
			// Lines start at canvasX, at intervals of scaledSpacing.
			// visualX = canvasX + (n * scaledSpacing)
			// We need visualX >= drawStartX
			// canvasX + n*ss >= drawStartX => n*ss >= drawStartX - canvasX => n >= (drawStartX - canvasX)/ss

			float startN_X = Mathf.Ceil((drawStartX - canvasX) / scaledSpacing);
			float endN_X = Mathf.Floor((drawEndX - canvasX) / scaledSpacing);

			for (float n = startN_X; n <= endN_X; n++)
			{
				float x = canvasX + (n * scaledSpacing);
				// Clamp X to draw range to avoid sub-pixel bleed? Not strictly needed if logic is right.
				painter.MoveTo(new Vector2(x, drawStartY));
				painter.LineTo(new Vector2(x, drawEndY));
			}

			// Y Lines (Horizontal)
			float startN_Y = Mathf.Ceil((drawStartY - canvasY) / scaledSpacing);
			float endN_Y = Mathf.Floor((drawEndY - canvasY) / scaledSpacing);

			for (float n = startN_Y; n <= endN_Y; n++)
			{
				float y = canvasY + (n * scaledSpacing);
				painter.MoveTo(new Vector2(drawStartX, y));
				painter.LineTo(new Vector2(drawEndX, y));
			}

			painter.Stroke();
		}
	}
}
