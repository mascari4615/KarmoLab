using UnityEngine.UIElements;
using KarmoToys.Main;
using KarmoToys.Common.Data;

namespace KarmoToys.Features.ProjectManager
{
	public partial class ProjectManagerFeature
	{
		public void OpenModal(ProjectItemData item)
		{
			_selectedItem = item;
			_editTitle.value = item.Title;
			_editContent.value = item.Content;
			_editType.value = item.Type;
			_editStatus.value = item.Status;
			_editPriority.value = item.Priority;
			_editDueDate.value = item.DueDate.HasValue ? item.DueDate.Value.ToString("yyyy-MM-dd") : "";
			_editTags.value = string.Join(", ", item.Tags);

			_detailModal.style.display = DisplayStyle.Flex;
		}

		public void CloseModal()
		{
			_detailModal.style.display = DisplayStyle.None;
			_selectedItem = null;
		}

		private void SaveSelectedItem()
		{
			if (_selectedItem == null) return;

			_selectedItem.Title = _editTitle.value;
			_selectedItem.Content = _editContent.value;
			_selectedItem.Type = (MemoType)_editType.value;
			_selectedItem.Status = (MemoStatus)_editStatus.value;
			_selectedItem.Priority = (Priority)_editPriority.value;

			// Parse Due Date
			if (System.DateTime.TryParse(_editDueDate.value, out System.DateTime parsedDate))
			{
				_selectedItem.DueDate = parsedDate;
			}
			else
			{
				_selectedItem.DueDate = null;
			}

			// Parse Tags
			_selectedItem.Tags.Clear();
			if (!string.IsNullOrWhiteSpace(_editTags.value))
			{
				string[] tags = _editTags.value.Split(new char[] { ',' }, System.StringSplitOptions.RemoveEmptyEntries);
				foreach (string t in tags)
				{
					_selectedItem.Tags.Add(t.Trim());
				}
			}

			KarmoToysApp.Instance.SaveData();
			RefreshViews();
			CloseModal();
			KarmoToysApp.Toast.Show("Changes saved! ✨");
		}

		private void DeleteSelectedItem()
		{
			if (_selectedItem == null) return;

			KarmoToysApp.Instance.Data.ProjectItems.Remove(_selectedItem);
			KarmoToysApp.Instance.SaveData();
			RefreshViews();
			CloseModal();
			KarmoToysApp.Toast.Show("Item deleted. 🗑️");
		}
	}
}
