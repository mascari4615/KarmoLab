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
			name = "WhiteboardNode";
			AddToClassList("whiteboard-node");
			pickingMode = PickingMode.Position;
			focusable = true;

			// Structure
			VisualElement header = new VisualElement { name = "node-header" };
			header.AddToClassList("node-header");
			header.pickingMode = PickingMode.Position;
			Add(header);

			Label title = new Label("Node Title") { name = "Title" };
			title.AddToClassList("node-title");
			title.pickingMode = PickingMode.Position;
			header.Add(title);

			VisualElement body = new VisualElement { name = "node-body" };
			body.AddToClassList("node-body");
			body.pickingMode = PickingMode.Position;
			Add(body);

			Label content = new Label("Content goes here...") { name = "Content" };
			content.AddToClassList("node-content");
			content.pickingMode = PickingMode.Position;
			body.Add(content);

			// Interaction
			this.AddManipulator(new NodeDragManipulator());

			// Diagnostic log
			RegisterCallback<PointerDownEvent>(evt => Debug.Log($"[WhiteboardNode] Raw Click on {evt.target}"), TrickleDown.NoTrickleDown);

			// Prevent Context Click (Right Click) from bubbling to Canvas (which creates new nodes)
			RegisterCallback<ContextClickEvent>(evt =>
			{
				Debug.Log("[WhiteboardNode] Context Click prevented bubbling");
				evt.StopPropagation();
			});
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
			style.left = newPos.x;
			style.top = newPos.y;

			if (_dataItem != null)
			{
				_dataItem.Position = newPos;
			}
			_onPositionChanged?.Invoke(newPos);
		}

		private void RefreshUI()
		{
			if (_dataItem == null) return;

			Label title = this.Q<Label>("Title");
			Label content = this.Q<Label>("Content");

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
					if (now - _lastClickTime < 0.4f)
					{
						Debug.Log($"[WhiteboardNode] 🟢 Double Click Triggered: {label.name}");
						StartEditing(label, onCommit, multiline);
						evt.PreventDefault();
						evt.StopImmediatePropagation();
						_lastClickTime = 0;
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
			TextField field = new TextField
			{
				multiline = multiline,
				value = label.text
			};
			field.style.position = Position.Absolute;

			// Layout sync
			Rect layout = label.layout;
			field.style.left = layout.xMin;
			field.style.top = layout.yMin;
			field.style.width = layout.width > 0 ? layout.width : 180;
			if (!multiline) field.style.height = layout.height > 0 ? layout.height : 25;

			field.AddToClassList(multiline ? "node-content-edit" : "node-title-edit");

			// 1. Setup attachment focus
			field.RegisterCallback<AttachToPanelEvent>(evt =>
			{
				field.Focus();
				if (!multiline) field.SelectAll();

				// 2. Deterministic sequencing: wait one frame for layout to settle
				field.schedule.Execute(() =>
				{
					// Hide label ONLY after field is established to prevent focus-vacuum
					label.style.display = DisplayStyle.None;

					// Register commit listener ONLY after focus is stable
					field.RegisterCallback<FocusOutEvent>(OnFocusLost);
				});
			});

			field.RegisterCallback<KeyDownEvent>(evt =>
			{
				if (evt.keyCode == KeyCode.Return && !multiline) field.Blur();
				else if (evt.keyCode == KeyCode.Escape)
				{
					field.value = label.text;
					field.Blur();
				}
			});

			// Independent named method/lambda for clean removal
			void OnFocusLost(FocusOutEvent evt)
			{
				Debug.Log($"[WhiteboardNode] 🔵 Edit Resolved for {label.name}");
				onCommit?.Invoke(field.value);
				field.RemoveFromHierarchy();
				label.style.display = DisplayStyle.Flex;
			}

			label.parent.Add(field);
		}
	}
}
