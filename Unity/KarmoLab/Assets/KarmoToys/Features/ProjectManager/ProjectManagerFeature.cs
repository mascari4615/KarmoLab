using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Core;
using KarmoToys.Common;
using KarmoToys.Features.ProjectManager.Modal;
using KarmoToys.Features.ProjectManager.ContextMenu;

namespace KarmoToys.Features.ProjectManager
{
	public enum ViewType { Table, Kanban, Timeline, Whiteboard }

	[AddComponentMenu("KarmoLab/Features/ProjectManager")]
	public class ProjectManagerFeature : FeatureBase
	{
		public static ProjectManagerFeature Instance { get; private set; }

		public static ProjectDetailModal Modal { get; private set; }
		public static ProjectContextMenu ContextMenu { get; private set; }

		public Table.TableFeature TableFeature { get; set; }
		public Kanban.KanbanFeature KanbanFeature { get; set; }
		public Timeline.TimelineFeature TimelineFeature { get; set; }
		public Whiteboard.WhiteboardFeature WhiteboardFeature { get; set; }

		public ViewType CurrentViewType { get; private set; } = ViewType.Table;
		public ProjectViewBase CurrentView => CurrentViewType switch
		{
			ViewType.Table => TableFeature,
			ViewType.Kanban => KanbanFeature,
			ViewType.Timeline => TimelineFeature,
			ViewType.Whiteboard => WhiteboardFeature,
			_ => null,
		};

		public override string FeatureName => Define.FeatureProjectManager;
		public override string TabButtonName => Define.TabProject;

		// View Containers
		private Button _btnViewTable, _btnViewKanban, _btnViewTimeline, _btnViewWhiteboard;

		private void Awake()
		{
			if (Instance == null) Instance = this;
			else Destroy(this);
		}

		public override void Initialize(VisualElement root)
		{
			ViewContainer = root.Q("ViewProjectManager");
			if (ViewContainer == null) return;

			Modal = new ProjectDetailModal(this, root.Q("ProjectDetailModalInstance"));
			ContextMenu = new ProjectContextMenu(this, root.Q("ContextMenuInstance"));

			// View Switcher
			TableFeature = new Table.TableFeature();
			TableFeature.Initialize(ViewContainer.Q("TableWrapper"));
			KanbanFeature = new Kanban.KanbanFeature();
			KanbanFeature.Initialize(ViewContainer.Q("KanbanWrapper"));
			TimelineFeature = new Timeline.TimelineFeature();
			TimelineFeature.Initialize(ViewContainer.Q("TimelineWrapper"));
			WhiteboardFeature = new Whiteboard.WhiteboardFeature();
			WhiteboardFeature.Initialize(ViewContainer.Q("WhiteboardWrapper"));

			_btnViewTable = ViewContainer.Q<Button>("BtnViewTable");
			_btnViewKanban = ViewContainer.Q<Button>("BtnViewKanban");
			_btnViewTimeline = ViewContainer.Q<Button>("BtnViewTimeline");
			_btnViewWhiteboard = ViewContainer.Q<Button>("BtnViewWhiteboard");

			_btnViewTable.clicked += () => SwitchView(ViewType.Table);
			_btnViewKanban.clicked += () => SwitchView(ViewType.Kanban);
			_btnViewTimeline.clicked += () => SwitchView(ViewType.Timeline);
			_btnViewWhiteboard.clicked += () => SwitchView(ViewType.Whiteboard);

			SwitchView(ViewType.Table);
		}

		public override void OnSelect()
		{
			base.OnSelect();
			CurrentView.Refresh();
		}

		private void SwitchView(ViewType type)
		{
			CurrentViewType = type;

			TableFeature.SetActive(type == ViewType.Table);
			KanbanFeature.SetActive(type == ViewType.Kanban);
			TimelineFeature.SetActive(type == ViewType.Timeline);
			WhiteboardFeature.SetActive(type == ViewType.Whiteboard);

			_btnViewTable.EnableInClassList("selected", type == ViewType.Table);
			_btnViewKanban.EnableInClassList("selected", type == ViewType.Kanban);
			_btnViewTimeline.EnableInClassList("selected", type == ViewType.Timeline);
			_btnViewWhiteboard.EnableInClassList("selected", type == ViewType.Whiteboard);

			CurrentView.Refresh();
		}
	}
}
