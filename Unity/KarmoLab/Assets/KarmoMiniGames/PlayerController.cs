using Unity.Netcode;
using UnityEngine;

namespace KarmoMinigames
{
	public class PlayerController : NetworkBehaviour
	{
		[SerializeField] private float moveSpeed = 5f;

		public override void OnNetworkSpawn()
		{
			if (!IsOwner) return;

			// 로컬 플레이어 구분을 위해 색상 변경 (선택 사항)
			if (TryGetComponent<Renderer>(out var renderer))
			{
				renderer.material.color = Color.green;
			}
		}

		private void Update()
		{
			if (!IsOwner) return;

			// 2D 환경에서는 X와 Y를 사용한다냥!
			float x = Input.GetAxis("Horizontal");
			float y = Input.GetAxis("Vertical");

			Vector3 moveDir = new Vector3(x, y, 0);
			if (moveDir.sqrMagnitude > 0)
			{
				// 서버에 이동 요청
				MoveServerRpc(moveDir * moveSpeed * Time.deltaTime);
			}
		}

		[ServerRpc]
		private void MoveServerRpc(Vector3 delta)
		{
			transform.position += delta;
		}
	}
}
