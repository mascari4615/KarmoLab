using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoToys.Core
{
	/// <summary>
	/// 모든 ?�처(기능)??기본 ?�래??
	/// </summary>
	public abstract class FeatureBase : MonoBehaviour, IFeature
	{
		public abstract string FeatureName { get; }
		public abstract string TabButtonName { get; }

		/// <summary>
		/// ???�처가 ?�당?�는 메인 �??�소
		/// </summary>
		protected VisualElement ViewContainer;

		public virtual void Initialize(VisualElement root)
		{
			// ?�위 ?�래?�에??override?�여 UI 바인???�행
			// ?? ViewContainer = root.Q("MyViewName");
		}

		public virtual void OnSelect()
		{
			if (ViewContainer != null)
			{
				ViewContainer.style.display = DisplayStyle.Flex;
				// ?�요??경우 ?�이???�로고침
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
		/// ?�이??갱신???�요?????�출
		/// </summary>
		protected virtual void RefreshData() { }
	}
}
