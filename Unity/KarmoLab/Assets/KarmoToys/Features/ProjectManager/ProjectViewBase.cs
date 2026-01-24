using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoToys.Features.ProjectManager
{
	public abstract class ProjectViewBase
	{
	 	public abstract string FeatureName { get; }
		public abstract string TabButtonName { get; }
		protected VisualElement ViewContainer { get; set; }

		/// <summary>
		/// Initialize the feature with the given root VisualElement
		/// </summary>
		/// <param name="root"></param>
		public abstract void Initialize(VisualElement root);

		/// <summary>
		/// Called when data needs to be refreshed
		/// </summary>
		public virtual void Refresh() { }

		public void SetActive(bool active) => ViewContainer.style.display = active ? DisplayStyle.Flex : DisplayStyle.None;
	}
}
