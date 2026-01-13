using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoToys.Core
{
	/// <summary>
	/// 모든 피처(기능)의 기본 클래스
	/// </summary>
	public abstract class FeatureBase : MonoBehaviour, IFeature
	{
		public abstract string FeatureName { get; }
		public abstract string TabButtonName { get; }

		/// <summary>
		/// 이 피처가 담당하는 메인 뷰 요소
		/// </summary>
		protected VisualElement ViewContainer;

		public virtual void Initialize(VisualElement root)
		{
			// 하위 클래스에서 override하여 UI 바인딩 수행
			// 예: ViewContainer = root.Q("MyViewName");
		}

		public virtual void OnSelect()
		{
			if (ViewContainer != null)
			{
				ViewContainer.style.display = DisplayStyle.Flex;
				// 필요한 경우 데이터 새로고침
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
		/// 데이터 갱신이 필요할 때 호출
		/// </summary>
		protected virtual void RefreshData() { }
	}
}
