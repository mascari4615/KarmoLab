using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Common.Data;
using System;

namespace KarmoToys.Features.ProjectManager.Whiteboard
{
	public class WhiteboardNode : VisualElement
	{
		public string NodeId => _dataItem?.Id;

		private ProjectItemData _dataItem;
		private Action _onSave;
		private Action<string> _onDelete;
		private Action<Vector2> _onPositionChanged;

		private float _lastClickTime;

		public WhiteboardNode()
		{
			// Style
			AddToClassList("whiteboard-node");

			// Structure
			var header = new VisualElement();
			header.AddToClassList("node-header");
			Add(header);

			var title = new Label("Node Title");
			title.AddToClassList("node-title");
			title.name = "Title";
			header.Add(title);

			var body = new VisualElement();
			body.AddToClassList("node-body");
			Add(body);

			var content = new Label("Content goes here...");
			content.AddToClassList("node-content");
			content.name = "Content";
			body.Add(content);

			// Interaction
			this.AddManipulator(new NodeDragManipulator());

			// Prevent Context Click (Right Click) from bubbling to Canvas (which creates new nodes)
			RegisterCallback<ContextClickEvent>(evt => evt.StopPropagation());
		}

		public void Bind(ProjectItemData data, Action onSave, Action<string> onDelete, Action<Vector2> onPositionChanged)
		{
			_dataItem = data;
			_onSave = onSave;
			_onDelete = onDelete;
			_onPositionChanged = onPositionChanged;

			RefreshUI();

			// Interaction: Editing
			RegisterEditTrigger(this.Q<Label>("Title"), (val) =>
			{
				_dataItem.Title = val;
				RefreshUI();
				_onSave?.Invoke();
			});

			RegisterEditTrigger(this.Q<Label>("Content"), (val) =>
			{
				_dataItem.Content = val;
				RefreshUI();
				_onSave?.Invoke();
			}, multiline: true);
		}

		public void UpdatePosition(Vector2 newPos)
		{
			_onPositionChanged?.Invoke(newPos);
		}

		private void RefreshUI()
		{
			if (_dataItem == null) return;

			var title = this.Q<Label>("Title");
			var content = this.Q<Label>("Content");

			if (title != null) title.text = _dataItem.Title;
			if (content != null) content.text = _dataItem.Content;
		}

		private void RegisterEditTrigger(Label label, Action<string> onCommit, bool multiline = false)
		{
			label.RegisterCallback<PointerDownEvent>(evt =>
			{
				if (evt.button == 0) // Left Click
				{
					float now = Time.unscaledTime;
					if (now - _lastClickTime < 0.3f) // Double Click Threshold (300ms)
					{
						Debug.Log("[WhiteboardNode] Double Click (Manual) Detected! Starting Edit.");
						StartEditing(label, onCommit, multiline);
						evt.StopPropagation();
						_lastClickTime = 0; // Reset
					}
					else
					{
						_lastClickTime = now;
					}
				}
			});
		}

		private void StartEditing(Label label, Action<string> onCommit, bool multiline)
		{
			var field = new TextField();
			field.multiline = multiline;
			field.value = label.text;
			field.style.position = Position.Absolute;
			field.style.left = label.layout.xMin;
			field.style.top = label.layout.yMin;
			field.style.width = label.layout.width;
			if (!multiline) field.style.height = label.layout.height;

			field.RegisterCallback<FocusOutEvent>(evt =>
			{
				onCommit?.Invoke(field.value);
				field.RemoveFromHierarchy();
				label.style.visibility = Visibility.Visible;
			});

			label.parent.Add(field);
			field.Focus();
			label.style.visibility = Visibility.Hidden;
		}
	}
}
