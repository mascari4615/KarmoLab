using System;
using System.Linq;
using KarmoToys.Core;
using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoToys.Features.Companion
{
	public class CompanionFeature : FeatureBase
	{
		public override string FeatureName => "Companion";
		public override string TabButtonName => "Companion";

		private bool _isCompanionMode;

		public override void Initialize(VisualElement root)
		{
			base.Initialize(root);

			// Check command line args
			string[] args = Environment.GetCommandLineArgs();
			_isCompanionMode = args.Contains("-mode") && args.Contains("companion");

			if (_isCompanionMode)
			{
				try
				{
					Debug.Log("Companion Mode Initialized!");
					InitializeTransparency();

					if (root != null)
					{
						ViewContainer = root; // Critical: Assignment for Update loop
						CreateCharacterPlaceholder(root);
					}
				}
				catch (System.Exception ex)
				{
					Debug.LogError($"Companion initialization failed: {ex}");
				}
			}
		}

		private void CreateCharacterPlaceholder(VisualElement root)
		{
			// Simple placeholder for now
			var character = new Label("🐱")
			{
				style =
				{
					fontSize = 100,
					top = 100,
					left = 100,
					color = Color.white,
					position = Position.Absolute
				}
			};
			root.Add(character);
		}

		private void InitializeTransparency()
		{
#if !UNITY_EDITOR
			// Start a coroutine to ensure transparency is applied after window initialization
			KarmoToys.Main.KarmoToysApp.Instance.StartCoroutine(TransparencyRoutine());
#else
			Debug.Log("Transparency simulation (check logs).");
#endif
		}

		private System.Collections.IEnumerator TransparencyRoutine()
		{
			// Try multiple times to ensure it sticks during initialization
			for (int i = 0; i < 5; i++)
			{
				WindowTransparencyUtils.EnableTransparency();
				WindowTransparencyUtils.SetAlwaysOnTop(true);
				yield return new WaitForSeconds(0.5f);
			}
		}

		private bool _isClickThrough = false;
		private float _topMostTimer = 0f;

		private void Update()
		{
			if (!_isCompanionMode) return;

			// 1. Enforce Always On Top periodically (every 1 sec) to prevent losing it on focus loss
			_topMostTimer += Time.deltaTime;
			if (_topMostTimer > 1.0f)
			{
				WindowTransparencyUtils.SetAlwaysOnTop(true);
				_topMostTimer = 0f;
			}

			// 2. Click-Through Logic (Raycast / UI Pick)
			if (ViewContainer != null && ViewContainer.panel != null)
			{
				// In Unity UI Toolkit, coordinates are top-left based. Input.mousePosition is bottom-left.
				Vector2 mousePos = Input.mousePosition;
				Vector2 uiPos = new Vector2(mousePos.x, Screen.height - mousePos.y);

				// Helper to pick element at screen position
				var picked = ViewContainer.panel.Pick(RuntimePanelUtils.ScreenToPanel(ViewContainer.panel, uiPos));

				// Determine if we are hovering a visual element that is NOT the root or generic container
				// In our case, the placeholder is a Label. Root is usually the full screen panel.
				bool isHoveringContent = picked != null && picked != ViewContainer;

				if (isHoveringContent != !_isClickThrough)
				{
					// State change required
					// If hovering content -> ClickThrough OFF (Block input)
					// If hovering empty -> ClickThrough ON (Pass input)
					_isClickThrough = !isHoveringContent;
					WindowTransparencyUtils.SetClickThrough(_isClickThrough);
					// Debug.Log($"[Companion] Hover: {isHoveringContent}, ClickThrough: {_isClickThrough}");
				}
			}
		}

		public override void OnSelect()
		{
			base.OnSelect();
			// In full app mode, this might just show a placeholder or control panel
		}
	}
}
