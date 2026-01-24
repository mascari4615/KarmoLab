using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Main;
using KarmoToys.Common.Data;

namespace KarmoToys.Features.ProjectManager.Whiteboard
{
	public class ProjectWhiteboardController
	{
		private readonly ProjectManagerFeature _owner;
		private readonly VisualElement _root;
		private VisualElement _canvas;
		private readonly Dictionary<string, WhiteboardNode> _nodeVisuals = new();
		private readonly Vector2 evalOffset = new(50000f, 50000f);

		public ProjectWhiteboardController(ProjectManagerFeature owner, VisualElement root)
		{
			_owner = owner;
			_root = root;
			Initialize();
		}

		private void Initialize()
		{
			VisualElement wbRoot = _root.Q("WhiteboardRoot");
			_canvas = wbRoot.Q("Canvas");
			GridBackground grid = wbRoot.Q<GridBackground>("GridPattern"); // WhiteboardRoot의 자식으로 변경

			if (_canvas == null) return;

			PanZoomManipulator manipulator = new PanZoomManipulator(_canvas);
			manipulator.Grid = grid;
			wbRoot.AddManipulator(manipulator);

			wbRoot.RegisterCallback<ContextClickEvent>(OnWhiteboardContextClick);
			wbRoot.RegisterCallback<PointerUpEvent>(OnWhiteboardPointerUp);

			LoadNodes();
		}

		private void LoadNodes()
		{
			foreach (ProjectItemData item in KarmoToysApp.Instance.Data.ProjectItems)
				SpawnNodeVisual(item);
		}

		private void OnWhiteboardPointerUp(PointerUpEvent evt)
		{
			if (evt.button == 1)
			{
				CalculateAndSpawnNode(evt.localPosition);
				evt.StopPropagation();
			}
		}

		private void OnWhiteboardContextClick(ContextClickEvent evt)
		{
			CalculateAndSpawnNode(evt.localMousePosition);
			evt.StopPropagation();
		}

		private void CalculateAndSpawnNode(Vector3 containerPos)
		{
			Translate styleTranslate = _canvas.style.translate.value;
			Scale styleScale = _canvas.style.scale.value.value;

			Vector3 pan = new Vector3(styleTranslate.x.value, styleTranslate.y.value, 0);
			float scale = styleScale.value.x;
			if (scale < 0.001f) scale = 1f;

			Vector3 canvasPos = (containerPos - pan) / scale;
			Vector2 logicalPos = (Vector2)canvasPos - evalOffset;

			CreateWhiteboardNode(logicalPos);
		}

		private void CreateWhiteboardNode(Vector2 position)
		{
			ProjectItemData newItem = new ProjectItemData("New Note", "Double-click to edit...")
			{
				Type = MemoType.Idea,
				Status = MemoStatus.Todo,
				Priority = Priority.Medium,
				Position = position,
				StartDateTicks = System.DateTime.Today.Ticks,
				DueDate = System.DateTime.Today.AddDays(3)
			};

			KarmoToysApp.Instance.Data.ProjectItems.Add(newItem);
			KarmoToysApp.Instance.SaveData();

			_owner.RefreshViews();
			SpawnNodeVisual(newItem);
		}

		private void SpawnNodeVisual(ProjectItemData data)
		{
			if (_nodeVisuals.ContainsKey(data.Id)) return;

			WhiteboardNode node = new WhiteboardNode();
			Vector2 visualPos = data.Position + evalOffset;
			node.style.left = visualPos.x;
			node.style.top = visualPos.y;

			node.Bind(data, OnNodeChanged, (id) => OnNodeDelete(id), (newVisualPos) =>
			{
				data.Position = newVisualPos - evalOffset;
				OnNodeChanged();
			});

			_canvas.Add(node);
			_nodeVisuals[data.Id] = node;
		}

		private void OnNodeChanged()
		{
			KarmoToysApp.Instance.SaveData();
		}

		private void OnNodeDelete(string nodeId)
		{
			ProjectItemData itemToRemove = KarmoToysApp.Instance.Data.ProjectItems.Find(item => item.Id == nodeId);
			if (itemToRemove != null) KarmoToysApp.Instance.Data.ProjectItems.Remove(itemToRemove);

			if (_nodeVisuals.TryGetValue(nodeId, out WhiteboardNode nodeVisual))
			{
				_canvas.Remove(nodeVisual);
				_nodeVisuals.Remove(nodeId);
			}

			KarmoToysApp.Instance.SaveData();
			_owner.RefreshViews();
		}

		public void Refresh() => SyncWhiteboardVisuals();

		private void SyncWhiteboardVisuals()
		{
			List<ProjectItemData> currentItems = KarmoToysApp.Instance.Data.ProjectItems;
			HashSet<string> currentIds = new HashSet<string>();

			foreach (ProjectItemData item in currentItems)
			{
				currentIds.Add(item.Id);
				if (!_nodeVisuals.ContainsKey(item.Id)) SpawnNodeVisual(item);
			}

			List<string> toRemove = new List<string>();
			foreach (KeyValuePair<string, WhiteboardNode> kvp in _nodeVisuals)
			{
				if (!currentIds.Contains(kvp.Key)) toRemove.Add(kvp.Key);
			}

			foreach (string id in toRemove)
			{
				if (_nodeVisuals.TryGetValue(id, out WhiteboardNode node))
				{
					_canvas.Remove(node);
					_nodeVisuals.Remove(id);
				}
			}
		}
	}
}
