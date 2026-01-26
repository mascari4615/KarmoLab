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
		private VisualElement _menuContent;
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
			_menuContent = _root.Q("ContextMenuContent");

			_btnCtxTodo.clicked += () => OnContextAction("todo");
			_btnCtxDoing.clicked += () => OnContextAction("doing");
			_btnCtxDone.clicked += () => OnContextAction("done");
			_btnCtxArchive.clicked += () => OnContextAction("archive");
			_btnCtxDelete.clicked += () => OnContextAction("delete");

			// 배경 클릭 시 컨텍스트 메뉴 닫기
			_root.RegisterCallback<PointerDownEvent>(evt =>
			{
				if (_menuContent != null && !_menuContent.worldBound.Contains(evt.position))
				{
					HideContextMenu();
					evt.StopPropagation();
				}
			});

			// 초기 상태: 숨김 및 클릭 통과
			_root.style.display = DisplayStyle.None;
			_root.pickingMode = PickingMode.Ignore;
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

		private void HideContextMenu()
		{
			_root.style.display = DisplayStyle.None;
			_root.pickingMode = PickingMode.Ignore;
			_contextItem = null;
		}

		public void Show(Vector2 mousePosition, ProjectItemData item)
		{
			_contextItem = item;
			_root.style.display = DisplayStyle.Flex;
			_root.pickingMode = PickingMode.Position;

			// Position menu content instead of root container
			Vector2 localPos = _root.WorldToLocal(mousePosition);
			_menuContent.style.left = localPos.x;
			_menuContent.style.top = localPos.y;

			_root.BringToFront();
		}
	}
}
