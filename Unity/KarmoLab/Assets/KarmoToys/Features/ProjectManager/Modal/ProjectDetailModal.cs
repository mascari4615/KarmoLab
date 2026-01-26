using System;
using System.Linq;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Main;
using KarmoToys.Common.Data;

namespace KarmoToys.Features.ProjectManager.Modal
{
	public class ProjectDetailModal
	{
		private readonly ProjectManagerFeature _owner;
		private readonly VisualElement _root;

		private TextField _editTitle, _editContent, _editDueDate, _editTags;
		private EnumField _editType, _editStatus, _editPriority;
		private Button _btnSaveItem, _btnDeleteItem, _btnCloseModal;
		private ProjectItemData _selectedItem;

		public ProjectDetailModal(ProjectManagerFeature owner, VisualElement root)
		{
			_owner = owner;
			_root = root;
			Initialize();
		}

		private void Initialize()
		{
			_editTitle = _root.Q<TextField>("EditTitle");
			_editContent = _root.Q<TextField>("EditContent");
			_editType = _root.Q<EnumField>("EditType");
			_editStatus = _root.Q<EnumField>("EditStatus");
			_editPriority = _root.Q<EnumField>("EditPriority");
			_editDueDate = _root.Q<TextField>("EditDueDate");
			_editTags = _root.Q<TextField>("EditTags");
			_btnSaveItem = _root.Q<Button>("BtnSaveProjectItem");
			_btnDeleteItem = _root.Q<Button>("BtnDeleteProjectItem");
			_btnCloseModal = _root.Q<Button>("BtnCloseModal");

			_btnSaveItem.clicked += SaveSelectedItem;
			_btnDeleteItem.clicked += DeleteSelectedItem;
			_btnCloseModal.clicked += Close;

			// Initialize EnumFields
			_editType.Init(MemoType.Task);
			_editStatus.Init(MemoStatus.Todo);
			_editPriority.Init(Priority.Medium);

			// 초기 상태: 숨김 및 클릭 통과
			_root.style.display = DisplayStyle.None;
			_root.pickingMode = PickingMode.Ignore;

			// 배경 클릭 시 모달 닫기
			_root.RegisterCallback<PointerDownEvent>(evt =>
			{
				// modal-container 외부를 클릭한 경우에만 닫기
				VisualElement modalContainer = _root.Q(className: "modal-container");
				if (modalContainer != null && !modalContainer.worldBound.Contains(evt.position))
				{
					Close();
					evt.StopPropagation();
				}
			});
		}

		public void Open(ProjectItemData item)
		{
			Debug.Log($"[ProjectDetailModal] Opening modal for item: {item?.Title ?? "NULL"}");

			if (item == null)
			{
				Debug.LogError("[ProjectDetailModal] Cannot open modal - item is null!");
				return;
			}

			_selectedItem = item;
			_editTitle.value = item.Title;
			_editContent.value = item.Content;
			_editType.value = item.Type;
			_editStatus.value = item.Status;
			_editPriority.value = item.Priority;
			_editDueDate.value = item.DueDate?.ToString("yyyy-MM-dd") ?? "";
			_editTags.value = string.Join(", ", item.Tags);

			// 모달 표시 및 입력 활성화
			_root.style.display = DisplayStyle.Flex;
			_root.pickingMode = PickingMode.Position;
			_root.BringToFront();

			Debug.Log($"[ProjectDetailModal] Modal opened. Display: {_root.style.display}, PickingMode: {_root.pickingMode}");
		}

		public void Close()
		{
			// 모달 숨기기 및 입력 비활성화 (클릭 통과)
			_root.style.display = DisplayStyle.None;
			_root.pickingMode = PickingMode.Ignore;
			_selectedItem = null;

			Debug.Log("[ProjectDetailModal] Modal closed.");
		}

		private void SaveSelectedItem()
		{
			if (_selectedItem == null) return;

			_selectedItem.Title = _editTitle.value;
			_selectedItem.Content = _editContent.value;
			_selectedItem.Type = (MemoType)_editType.value;
			_selectedItem.Status = (MemoStatus)_editStatus.value;
			_selectedItem.Priority = (Priority)_editPriority.value;

			if (DateTime.TryParse(_editDueDate.value, out DateTime parsedDate)) _selectedItem.DueDate = parsedDate;
			else _selectedItem.DueDate = null;

			_selectedItem.Tags.Clear();
			if (!string.IsNullOrWhiteSpace(_editTags.value))
			{
				var tags = _editTags.value.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
				_selectedItem.Tags.AddRange(tags.Select(t => t.Trim()));
			}

			KarmoToysApp.Instance.SaveData();
			_owner.CurrentView.Refresh();
			Close();
			KarmoToysApp.Toast.Show("Changes saved! ✨");
		}

		private void DeleteSelectedItem()
		{
			if (_selectedItem == null) return;
			KarmoToysApp.Instance.Data.ProjectItems.Remove(_selectedItem);
			KarmoToysApp.Instance.SaveData();
			_owner.CurrentView.Refresh();
			Close();
			KarmoToysApp.Toast.Show("Item deleted. 🗑️");
		}
	}
}
