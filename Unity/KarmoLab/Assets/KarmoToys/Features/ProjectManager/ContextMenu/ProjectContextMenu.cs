using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Main;
using KarmoToys.Common.Data;

namespace KarmoToys.Features.ProjectManager.ContextMenu
{
	public class ProjectContextMenu
	{
		private readonly ProjectManagerFeature _owner;
		private readonly VisualElement _root;

		private Button _btnCtxTodo, _btnCtxDoing, _btnCtxDone, _btnCtxArchive, _btnCtxDelete;
		private ProjectItemData _contextItem;

		public ProjectContextMenu(ProjectManagerFeature owner, VisualElement root)
		{
			_owner = owner;
			_root = root;
			Initialize();
		}

		private void Initialize()
		{
			_btnCtxTodo = _root.Q<Button>("BtnCtxTodo");
			_btnCtxDoing = _root.Q<Button>("BtnCtxDoing");
			_btnCtxDone = _root.Q<Button>("BtnCtxDone");
			_btnCtxArchive = _root.Q<Button>("BtnCtxArchive");
			_btnCtxDelete = _root.Q<Button>("BtnCtxDelete");
		
			_btnCtxTodo.clicked += () => OnContextAction("todo");
			_btnCtxDoing.clicked += () => OnContextAction("doing");
			_btnCtxDone.clicked += () => OnContextAction("done");
			_btnCtxArchive.clicked += () => OnContextAction("archive");
			_btnCtxDelete.clicked += () => OnContextAction("delete");
		}

		private void OnContextAction(string action)
		{
			if (_contextItem == null) return;

			switch (action)
			{
				case "todo": _contextItem.Status = MemoStatus.Todo; break;
				case "doing": _contextItem.Status = MemoStatus.Doing; break;
				case "done": _contextItem.Status = MemoStatus.Done; break;
				case "archive": _contextItem.Status = MemoStatus.Archive; break;
				case "delete":
					KarmoToysApp.Instance.Data.ProjectItems.Remove(_contextItem);
					KarmoToysApp.Toast.Show("Item deleted 🗑️");
					break;
			}

			if (action != "delete") KarmoToysApp.Instance.SaveData();

			_owner.CurrentView.Refresh();
			HideContextMenu();
		}

		public void HideIfVisible(PointerDownEvent evt)
		{
			// If clicking outside context menu, close it
			if (_root.style.display == DisplayStyle.Flex &&
				!_root.ContainsPoint(evt.localPosition))
			{
				HideContextMenu();
			}
		}

		private void HideContextMenu()
		{
			_root.style.display = DisplayStyle.None;
			_contextItem = null;
		}

		public void Show(Vector2 mousePosition, ProjectItemData item)
		{
			_contextItem = item;
			_root.style.display = DisplayStyle.Flex;

			// Position menu
			Vector2 localPos = _root.WorldToLocal(mousePosition);
			_root.style.left = localPos.x;
			_root.style.top = localPos.y;

			_root.BringToFront();
		}
	}
}
