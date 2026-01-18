using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoToys.Core
{
	/// <summary>
	/// Base class for all features
	/// </summary>
	public abstract class FeatureBase : MonoBehaviour, IFeature
	{
		public abstract string FeatureName { get; }
		public abstract string TabButtonName { get; }

		/// <summary>
		/// Main Element Container for this Feature's View
		/// </summary>
		protected VisualElement ViewContainer;

		/// <summary>
		/// Initialize the feature with the given root VisualElement
		/// </summary>
		/// <param name="root"></param>
		public abstract void Initialize(VisualElement root);

		public virtual void OnSelect()
		{
			if (ViewContainer != null)
			{
				ViewContainer.style.display = DisplayStyle.Flex;
				// Refresh if needed
				RefreshData();
			}
		}

		public virtual void OnDeselect()
		{
			if (ViewContainer != null)
			{
				ViewContainer.style.display = DisplayStyle.None;
			}
		}

		/// <summary>
		/// Called when data needs to be refreshed
		/// </summary>
		protected virtual void RefreshData() { }
	}
}
