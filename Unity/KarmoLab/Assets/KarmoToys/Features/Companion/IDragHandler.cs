using UnityEngine;

namespace KarmoToys.Features.Companion
{
	public enum InteractionDimension { None, TwoD, ThreeD, UI }

	/// <summary>
	/// 컴패니언 모드에서 드래그 이벤트를 처리할 수 있는 인터페이스다냥! 🐾
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
