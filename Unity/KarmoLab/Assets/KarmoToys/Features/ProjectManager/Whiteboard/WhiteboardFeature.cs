using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Core;
using KarmoToys.Main;


namespace KarmoToys.Features.ProjectManager.Whiteboard
{
	[AddComponentMenu("KarmoToys/Features/WhiteboardFeature")]
	public class WhiteboardFeature : FeatureBase
	{
		public override string FeatureName => Common.Define.FeatureWhiteboard;
		public override string TabButtonName => string.Empty; // Sub-feature of ProjectManager

		private VisualElement _canvas;

		public override void Initialize(VisualElement root)
		{
			Debug.Log("[Whiteboard] Initializing...");
			var container = root.Q("WhiteboardContainer");
			if (container == null)
			{
				Debug.LogError("[Whiteboard] Container not found!");
				return;
			}

			// Link to FeatureBase ViewContainer for standard tab switching
			ViewContainer = container;

			// Setup Canvas Interactability
			_canvas = container.Q("Canvas");
			if (_canvas != null)
			{
				// Attach manipulator to the Container (receives events), but transform the Canvas (visuals)
				container.AddManipulator(new PanZoomManipulator(_canvas));

				// Register Create Node Context Menu
				container.RegisterCallback<ContextClickEvent>(OnContextClick);
				container.RegisterCallback<PointerUpEvent>(OnPointerUp);
				// Load Existing Nodes
				LoadNodes();
			}
		}

		private void LoadNodes()
		{
			if (KarmoToysApp.Instance.Data == null || KarmoToysApp.Instance.Data.WhiteboardNodes == null) return;

			foreach (var nodeData in KarmoToysApp.Instance.Data.WhiteboardNodes)
			{
				SpawnNodeVisual(nodeData);
			}
		}

		private void OnPointerUp(PointerUpEvent evt)
		{
			// Fallback for Right Click if ContextClick doesn't fire
			if (evt.button == 1) // Right Mouse Button
			{
				Debug.Log($"[Whiteboard] Right Click detected via PointerUp at {evt.localPosition}");
				CalculateAndSpawnNode(evt.localPosition);
				evt.StopPropagation();
			}
		}

		private void OnContextClick(ContextClickEvent evt)
		{
			Debug.Log($"[Whiteboard] Context Click detected at {evt.localMousePosition}");
			CalculateAndSpawnNode(evt.localMousePosition);
			evt.StopPropagation();
		}

		private void CalculateAndSpawnNode(Vector3 containerPos)
		{
			// Calculation logic extracted
			var styleTranslate = _canvas.style.translate.value;
			var styleScale = _canvas.style.scale.value.value;

			Vector3 pan = new Vector3(styleTranslate.x.value, styleTranslate.y.value, 0);
			float scale = styleScale.x;
			if (scale < 0.001f) scale = 1f;

			Vector3 canvasPos = (containerPos - pan) / scale;

			CreateNode(canvasPos);
		}

		private void CreateNode(Vector2 position, string title = "New Note", string content = "Double-click to edit...")
		{
			var newData = new Common.Data.WhiteboardNodeData
			{
				Id = System.Guid.NewGuid().ToString(),
				Title = title,
				Content = content,
				X = position.x,
				Y = position.y,
				Width = 200,
				Height = 150
			};

			KarmoToysApp.Instance.Data.WhiteboardNodes.Add(newData);
			KarmoToysApp.Instance.SaveData();

			SpawnNodeVisual(newData);
		}

		private void SpawnNodeVisual(Common.Data.WhiteboardNodeData data)
		{
			var node = new WhiteboardNode();
			node.Bind(null, OnNodeChanged, null, null);
			_canvas.Add(node);
		}

		private void OnNodeChanged()
		{
			KarmoToysApp.Instance.SaveData();
		}


		public override void OnSelect()
		{
			base.OnSelect();
			Debug.Log("[Whiteboard] OnSelect called. Visibility should be Flex.");
			// Additional initialization on show (e.g. centering view) can go here
		}
	}
}
