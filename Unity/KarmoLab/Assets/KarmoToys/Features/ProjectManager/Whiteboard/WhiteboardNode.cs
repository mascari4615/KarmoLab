using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Common.Data;
using System;

namespace KarmoToys.Features.ProjectManager.Whiteboard
{
	public class WhiteboardNode : VisualElement
	{
		public string NodeId => _data?.Id;

		private WhiteboardNodeData _data;
		private Action _onSave;

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

		public void Bind(WhiteboardNodeData data, Action onSave)
		{
			_data = data;
			_onSave = onSave;

			RefreshUI();

			// Interaction: Editing
			RegisterEditTrigger(this.Q<Label>("Title"), (val) =>
			{
				_data.Title = val;
				RefreshUI();
				_onSave?.Invoke();
			});

			RegisterEditTrigger(this.Q<Label>("Content"), (val) =>
			{
				_data.Content = val;
				RefreshUI();
				_onSave?.Invoke();
			}, multiline: true);
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
			Debug.Log($"[WhiteboardNode] StartEditing: {label.text}");
			var parent = label.parent;
			var index = parent.IndexOf(label);

			// Swap Label with TextField
			var input = new TextField();
			input.value = label.text;
			input.AddToClassList(multiline ? "node-content-edit" : "node-title-edit"); // CSS needed
			if (multiline) input.multiline = true;

			// Hide Label
			label.style.display = DisplayStyle.None;

			// Insert Input
			parent.Insert(index, input);

			// Focus (Delayed to ensure layout update)
			input.schedule.Execute(() =>
			{
				var textInput = input.Q("unity-text-input");
				textInput.Focus();
				Debug.Log("[WhiteboardNode] Input Focused");
			});

			// Commit Logic
			void Commit()
			{
				Debug.Log($"[WhiteboardNode] Committing: {input.value}");
				onCommit(input.value);
				parent.Remove(input);
				label.style.display = DisplayStyle.Flex;
			}

			// Register FocusOut
			input.RegisterCallback<FocusOutEvent>(evt =>
			{
				Debug.Log("[WhiteboardNode] FocusOut Detected -> Commiting");
				Commit();
			});

			// Enter key for single line
			if (!multiline)
			{
				input.RegisterCallback<KeyDownEvent>(evt =>
				{
					if (evt.keyCode == KeyCode.Return)
					{
						Debug.Log("[WhiteboardNode] Enter Key Detected -> Commiting");
						Commit();
					}
				});
			}
		}

		private void RefreshUI()
		{
			if (_data == null) return;

			this.Q<Label>("Title").text = _data.Title;
			this.Q<Label>("Content").text = _data.Content;

			// Layout
			style.left = _data.X;
			style.top = _data.Y;

			// Future: Width/Height/Color
		}

		public void SetTitle(string text)
		{
			if (_data != null) _data.Title = text;
			this.Q<Label>("Title").text = text;
			_onSave?.Invoke();
		}

		public void SetContent(string text)
		{
			if (_data != null) _data.Content = text;
			this.Q<Label>("Content").text = text;
			_onSave?.Invoke();
		}

		public void UpdatePosition(Vector2 pos)
		{
			if (_data != null)
			{
				_data.X = pos.x;
				_data.Y = pos.y;
			}

			style.left = pos.x;
			style.top = pos.y;

			_onSave?.Invoke();
		}
	}
}
