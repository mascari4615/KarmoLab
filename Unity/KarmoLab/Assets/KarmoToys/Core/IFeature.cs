using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoToys.Core
{
	public interface IFeature
	{
		string FeatureName { get; }
		string TabButtonName { get; } // UI의 탭 버튼 ID

		/// <summary>
		/// 초기화: UI 요소 바인딩 및 데이터 로드
		/// </summary>
		/// <param name="root">전체 UI 루트</param>
		void Initialize(VisualElement root);

		/// <summary>
		/// 탭이 선택되었을 때 호출 (화면 표시 처리 등)
		/// </summary>
		void OnSelect();

		/// <summary>
		/// 탭이 해제되었을 때 호출 (화면 숨김 처리 등)
		/// </summary>
		void OnDeselect();
	}
}
