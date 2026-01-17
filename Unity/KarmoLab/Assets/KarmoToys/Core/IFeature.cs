using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoToys.Core
{
	public interface IFeature
	{
		string FeatureName { get; }
		string TabButtonName { get; } // UI????버튼 ID

		/// <summary>
		/// 초기?? UI ?�소 바인??�??�이??로드
		/// </summary>
		/// <param name="root">?�체 UI 루트</param>
		void Initialize(VisualElement root);

		/// <summary>
		/// ??�� ?�택?�었?????�출 (?�면 ?�시 처리 ??
		/// </summary>
		void OnSelect();

		/// <summary>
		/// ??�� ?�제?�었?????�출 (?�면 ?��? 처리 ??
		/// </summary>
		void OnDeselect();
	}
}
