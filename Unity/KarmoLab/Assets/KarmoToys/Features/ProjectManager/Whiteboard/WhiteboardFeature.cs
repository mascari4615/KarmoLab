using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Main;
using KarmoToys.Common.Data;

namespace KarmoToys.Features.ProjectManager.Whiteboard
{
	[AddComponentMenu("KarmoToys/Features/WhiteboardFeature")]
	public class WhiteboardFeature : ProjectViewBase
	{
		public override string FeatureName => Common.Define.FeatureWhiteboard;
		public override string TabButtonName => string.Empty; // Sub-feature of ProjectManager

		private VisualElement _container;
		private VisualElement _canvas;

		public override void Initialize(VisualElement root)
		{
			ViewContainer = root;
			_container = root.Q("WhiteboardContainer");

			if (_container == null)
			{
				Debug.LogError("[WhiteboardFeature] WhiteboardContainer not found in root!");
				return;
			}

			_canvas = _container.Q("Canvas");
			if (_canvas == null)
			{
				Debug.LogError("[WhiteboardFeature] Canvas not found in WhiteboardContainer!");
				return;
			}

			// Attach manipulator to the Container (receives events), but transform the Canvas (visuals)
			_container.AddManipulator(new PanZoomManipulator(_canvas));

			// Register Create Node Context Menu
			_container.RegisterCallback<ContextClickEvent>(OnContextClick);
			_container.RegisterCallback<PointerUpEvent>(OnPointerUp);

			Debug.Log("[WhiteboardFeature] Initialized successfully.");
		}

		public override void Refresh()
		{
			if (_canvas == null) return;

			// Clear existing nodes
			_canvas.Query<WhiteboardNode>().ForEach(node => node.RemoveFromHierarchy());

			// Reload from data
			if (KarmoToysApp.Instance.Data?.ProjectItems == null) return;

			foreach (ProjectItemData item in KarmoToysApp.Instance.Data.ProjectItems)
			{
				// Whiteboard에 표시할 아이템만 필터링 (Position이 설정된 것)
				if (item.Position.x != 0 || item.Position.y != 0)
				{
					SpawnNodeVisual(item);
				}
			}

			Debug.Log($"[WhiteboardFeature] Refreshed. Nodes: {_canvas.Query<WhiteboardNode>().ToList().Count}");
		}

		private void OnPointerUp(PointerUpEvent evt)
		{
			// Fallback for Right Click if ContextClick doesn't fire
			if (evt.button == 1)
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
			Translate styleTranslate = _canvas.style.translate.value;
			Vector3 styleScale = _canvas.style.scale.value.value;

			Vector3 pan = new Vector3(styleTranslate.x.value, styleTranslate.y.value, 0);
			float scale = styleScale.x;
			if (scale < 0.001f) scale = 1f;

			Vector3 canvasPos = (containerPos - pan) / scale;

			CreateNode(canvasPos);
		}

		private void CreateNode(Vector2 position, string title = "New Note", string content = "Double-click to edit...")
		{
			ProjectItemData newItem = new ProjectItemData(title, content)
			{
				Position = position
			};

			KarmoToysApp.Instance.Data.ProjectItems.Add(newItem);
			KarmoToysApp.Instance.SaveData();

			SpawnNodeVisual(newItem);
		}

		private void SpawnNodeVisual(ProjectItemData data)
		{
			WhiteboardNode node = new WhiteboardNode();
			node.Bind(data, OnNodeChanged, OnNodeDeleted, OnNodePositionChanged);

			// Set position on canvas
			node.style.position = Position.Absolute;
			node.style.left = data.Position.x;
			node.style.top = data.Position.y;

			_canvas.Add(node);
		}

		private void OnNodeChanged() => KarmoToysApp.Instance.SaveData();

		private void OnNodeDeleted(string id)
		{
			KarmoToysApp.Instance.Data.ProjectItems.RemoveAll(item => item.Id == id);
			KarmoToysApp.Instance.SaveData();
			Refresh();
		}

		private void OnNodePositionChanged(Vector2 newPos) => KarmoToysApp.Instance.SaveData();
	}
}
