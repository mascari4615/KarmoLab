using UnityEngine;
using KarmoToys.Features.Companion;
#if UNITY_EDITOR
using UnityEditor.Animations;
#endif
using System.Collections.Generic;
using System.Linq;

/// <summary>
/// 컴패니언 캐릭터 활동(드래그 등) 반응용 기본 클래스. 🐾
/// 3D 오브젝트용 콜라이더 안전장치 포함.
/// </summary>
public class CompanionCharacter : MonoBehaviour, IDragHandler
{
	public virtual InteractionDimension Dimension => InteractionDimension.ThreeD;
	public Transform Transform => transform;

	[SerializeField] protected Animator _animator;
	[SerializeField] protected string _idleTag = "Idle";
	[SerializeField] protected string[] _idleStates = { "IDLE" };

	public virtual Vector3 GetHeadPosition()
	{
		if (_animator != null && _animator.isHuman)
		{
			Transform head = _animator.GetBoneTransform(HumanBodyBones.Head);
			if (head != null) return head.position + Vector3.up * 0.3f; // Slightly above head
		}
		// Fallback for non-humanoid or missing animator
		if (TryGetComponent(out Collider col))
			return col.bounds.center + Vector3.up * col.bounds.extents.y + Vector3.up * 0.2f;

		return transform.position + Vector3.up * 1.5f;
	}

	protected Coroutine _idleCoroutine;

	// Hash Caching for performance
	protected static readonly int AnimIdle = Animator.StringToHash("IDLE");
	protected static readonly int AnimPickedUp = Animator.StringToHash("PICKED_UP");
	protected static readonly int AnimSleep = Animator.StringToHash("SLEEP");

	public virtual void SetSleepMode(bool isSleeping)
	{
		if (isSleeping)
		{
			StopIdleLoop();

			if (_animator != null)
			{
				if (_animator.HasState(0, AnimSleep))
				{
					_animator.Play(AnimSleep);
					Debug.Log($"[CompanionCharacter] Playing Sleep Animation ({name})");
				}
				else
				{
					Debug.LogWarning($"[CompanionCharacter] '{name}' Animator does not have 'SLEEP' state! Please add it.");
				}
			}
		}
		else
		{
			Debug.Log($"[CompanionCharacter] Resuming Idle Loop ({name})");
			StartIdleLoop();
		}
	}

	protected virtual void Awake()
	{
		// 3D 오브젝트는 콜라이더 존재 시 드래그 감지 가능.
		if (Dimension == InteractionDimension.ThreeD)
		{
			if (GetComponent<Collider>() == null && GetComponentInChildren<Collider>() == null)
			{
				Debug.Log($"[Companion] {name} is 3D but has no collider. Adding BoxCollider for safety.");
				gameObject.AddComponent<BoxCollider>();
			}
		}

		// 루트 모션 회전 누적 방지 및 정렬 초기화. ✨
		if (_animator != null)
		{
			_animator.applyRootMotion = false;
			_animator.transform.localRotation = Quaternion.identity;
		}
	}

	protected virtual void OnEnable()
	{
		StartIdleLoop();
	}

	protected virtual void OnDisable()
	{
		StopIdleLoop();
	}

	public virtual void OnDragStart()
	{
		Debug.Log($"[Companion] {name} Drag Started! 🐾");
		StopIdleLoop();
		PlayAnimation(AnimPickedUp);
	}

	public virtual void OnDrag(Vector3 worldPosition)
	{
		// 드래그 중 로직 구현용
	}

	public virtual void OnDragEnd()
	{
		Debug.Log($"[Companion] {name} Drag Ended! ✨");
		StartIdleLoop();
	}

	protected void StartIdleLoop()
	{
		StopIdleLoop();
		if (gameObject.activeInHierarchy)
		{
			_idleCoroutine = StartCoroutine(IdleAnimationRoutine());
		}
	}

	protected void StopIdleLoop()
	{
		if (_idleCoroutine != null)
		{
			StopCoroutine(_idleCoroutine);
			_idleCoroutine = null;
		}
	}

	private System.Collections.IEnumerator IdleAnimationRoutine()
	{
		while (true)
		{
			if (_idleStates == null || _idleStates.Length == 0)
			{
				PlayAnimation(AnimIdle);
				yield break;
			}

			string stateName = _idleStates[Random.Range(0, _idleStates.Length)];
			PlayAnimation(Animator.StringToHash(stateName));

			// 애니메이션을 5~15초 동안 재생 후 다음 랜덤 애니메이션으로 전환.
			yield return new WaitForSeconds(Random.Range(5f, 15f));
		}
	}

	protected void PlayAnimation(int stateHash)
	{
		if (_animator != null)
		{
			_animator.Play(stateHash);
		}
	}

#if UNITY_EDITOR
	[ContextMenu("Scan Animator by Tag")]
	private void ScanAnimatorByTag()
	{
		if (_animator == null || _animator.runtimeAnimatorController == null)
		{
			Debug.LogWarning($"[Companion] {name}: No Animator or Controller found to scan.");
			return;
		}

		// Handle both AnimatorController and AnimatorOverrideController
		AnimatorController controller = null;
		if (_animator.runtimeAnimatorController is AnimatorController ac)
		{
			controller = ac;
		}
		else if (_animator.runtimeAnimatorController is AnimatorOverrideController oc)
		{
			controller = oc.runtimeAnimatorController as AnimatorController;
		}

		if (controller == null)
		{
			Debug.LogWarning($"[Companion] {name}: Could not access AnimatorController.");
			return;
		}

		List<string> foundStates = new List<string>();
		foreach (AnimatorControllerLayer layer in controller.layers)
		{
			ExtractStatesFromStateMachine(layer.stateMachine, foundStates);
		}

		if (foundStates.Count > 0)
		{
			_idleStates = foundStates.ToArray();
			Debug.Log($"[Companion] {name}: Successfully found {foundStates.Count} states with tag '{_idleTag}'.");
			UnityEditor.EditorUtility.SetDirty(this);
		}
		else
		{
			Debug.LogWarning($"[Companion] {name}: No states found with tag '{_idleTag}'. Make sure your Animator states have the correct tag applied.");
		}
	}

	private void ExtractStatesFromStateMachine(AnimatorStateMachine machine, List<string> results)
	{
		results.AddRange(machine.states.Where(state => state.state.tag == _idleTag).Select(state => state.state.name));
		foreach (ChildAnimatorStateMachine subMachine in machine.stateMachines)
		{
			ExtractStatesFromStateMachine(subMachine.stateMachine, results);
		}
	}
#endif
}
