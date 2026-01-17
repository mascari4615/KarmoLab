using UnityEngine;

namespace KarmoToys.Features.Companion
{
	public enum InteractionDimension { None, TwoD, ThreeD, UI }

	/// <summary>
	/// 컴패니언 모드 드래그 이벤트 처리 인터페이스. 🐾
	/// </summary>
	public interface IDragHandler
	{
		InteractionDimension Dimension { get; }
		Transform Transform { get; }
		void OnDragStart();
		void OnDrag(Vector3 worldPosition);
		void OnDragEnd();
	}
}
