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
		private readonly System.Collections.Generic.List<KarmoToys.Features.Companion.Modules.ICompanionModule> _modules = new();
		private KarmoToys.Features.Companion.Modules.CompanionContext _context;

		// Subsystem Refs for linking
		private KarmoToys.Features.Companion.Modules.ChatModule _chatModule;
		private KarmoToys.Features.Companion.Modules.InteractionModule _interactionModule;

		public override void Initialize(VisualElement root)
		{
			// Check Mode (Now handled centrally by KarmoToysApp)
			if (KarmoToys.Main.KarmoToysApp.Instance != null)
			{
				_isCompanionMode = KarmoToys.Main.KarmoToysApp.Instance.Mode == KarmoToys.Common.AppMode.Companion;
			}
			else
			{
				string[] args = Environment.GetCommandLineArgs();
				_isCompanionMode = args.Contains("-mode") && args.Contains("companion");
			}

			if (_isCompanionMode)
			{
				try
				{
					Debug.Log("Companion Mode Initialized (Modular)!");
					Application.runInBackground = true;

					// 1. Transparency Init
					try
					{
						InitializeTransparency();
					}
					catch (System.Exception ex) { Debug.LogError($"[Companion] Transparency Init Failed: {ex}"); }

					ViewContainer = root;

					// 2. Build Context
					_context = new KarmoToys.Features.Companion.Modules.CompanionContext
					{
						RootUI = root,
						ViewContainer = root,
						Settings = KarmoToys.Main.KarmoToysApp.Instance?.Settings
					};

					// 3. Create Modules
					_chatModule = new KarmoToys.Features.Companion.Modules.ChatModule();
					_interactionModule = new KarmoToys.Features.Companion.Modules.InteractionModule();
					KarmoToys.Features.Companion.Modules.TimeModule timeModule = new KarmoToys.Features.Companion.Modules.TimeModule();
					KarmoToys.Features.Companion.Modules.IdleMonitorModule idleModule = new KarmoToys.Features.Companion.Modules.IdleMonitorModule();

					// 4. Link Modules (Dependency Injection)
					_interactionModule.SetChatModule(_chatModule);
					_interactionModule.SetTimeModule(timeModule);
					timeModule.SetChatModule(_chatModule);
					idleModule.SetChatModule(_chatModule);

					// 5. Register & Init
					RegisterModule(_chatModule);
					RegisterModule(_interactionModule); // Interaction last to handle input based on visual state
					RegisterModule(timeModule);
					RegisterModule(idleModule);
				}
				catch (System.Exception ex)
				{
					Debug.LogError($"Companion initialization failed: {ex}");
				}
			}
		}

		private void RegisterModule(KarmoToys.Features.Companion.Modules.ICompanionModule module)
		{
			try
			{
				module.Initialize(_context);
				_modules.Add(module);
			}
			catch (System.Exception ex)
			{
				Debug.LogError($"[Companion] Failed to init module {module.GetType().Name}: {ex}");
			}
		}

		private void InitializeTransparency()
		{
#if !UNITY_EDITOR
			// Note: Resolution handling is now done in KarmoToysApp.Start() to avoid double-set conflict.
			// We just start the transparency routine here.
			KarmoToys.Main.KarmoToysApp.Instance.StartCoroutine(TransparencyRoutine());
#else
			Debug.Log("Transparency simulation: Setting Camera background to Grey.");
			if (Camera.main != null)
			{
				Camera.main.clearFlags = CameraClearFlags.SolidColor;
				Camera.main.backgroundColor = new Color(0.5f, 0.5f, 0.5f, 1.0f); // Solid Grey
			}
#endif
		}

		private System.Collections.IEnumerator TransparencyRoutine()
		{
			for (int i = 0; i < 5; i++)
			{
				WindowTransparencyUtils.EnableTransparency();
				WindowTransparencyUtils.SetAlwaysOnTop(true);
				yield return new WaitForSeconds(0.5f);
			}
		}

		private float _topMostTimer = 0f;

		private void Update()
		{
			if (!_isCompanionMode) return;

			// Global Periodic logic (Keep Always On Top)
			_topMostTimer += Time.deltaTime;
			if (_topMostTimer > 1.0f)
			{
				WindowTransparencyUtils.SetAlwaysOnTop(true);
				_topMostTimer = 0f;
			}

			// Update all modules
			foreach (KarmoToys.Features.Companion.Modules.ICompanionModule module in _modules)
			{
				module.Update();
			}
		}

		private void OnDestroy()
		{
			foreach (KarmoToys.Features.Companion.Modules.ICompanionModule module in _modules)
			{
				module.OnDestroy();
			}
			_modules.Clear();
		}
	}
}
