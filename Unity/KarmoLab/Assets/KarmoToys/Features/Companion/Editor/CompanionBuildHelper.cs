using UnityEditor;
using UnityEngine;

namespace KarmoToys.Features.Companion.Editor
{
	public class CompanionBuildHelper
	{
		[MenuItem("KarmoTools/Companion Mode/Configure Player Settings")]
		public static void ConfigureForTransparency()
		{
			// 1. Fullscreen Mode -> Fullscreen Window (D3D11 windowed)
			PlayerSettings.fullScreenMode = FullScreenMode.FullScreenWindow;

			// 2. Use Flip Model Swapchain -> False (CRITICAL for DWM transparency)
			// Note: This API might change in newer Unity versions, but for now accessing it via SerializedObject is safest for legacy property access
			// Or typically simple:
			PlayerSettings.useFlipModelSwapchain = false;

			// 3. Run In Background -> True
			PlayerSettings.runInBackground = true;

			// 4. Allow resizable window -> True
			PlayerSettings.resizableWindow = true;

			Debug.Log("[CompanionBuildHelper] Transparency settings applied:\n" +
					  "- FullScreenMode: FullScreenWindow\n" +
					  "- UseFlipModelSwapchain: False\n" +
					  "- RunInBackground: True");

			// 5. Graphics API -> Direct3D11 (Force)
			PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.StandaloneWindows64, false);
			PlayerSettings.SetGraphicsAPIs(BuildTarget.StandaloneWindows64, new UnityEngine.Rendering.GraphicsDeviceType[] { UnityEngine.Rendering.GraphicsDeviceType.Direct3D11 });
			Debug.Log("- Graphics API: Forced Direct3D11");

			// 6. Disable HDR on current URP Asset
			UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset urpAsset = UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline as UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset;
			if (urpAsset != null)
			{
				urpAsset.supportsHDR = false;
				Debug.Log("- URP HDR: Disabled");

				// Note: Disabling Post-Processing globally on the asset isn't directly exposed via public property in older versions,
				// but usually handled per-camera. CompanionFeature's camera should handle this.
			}

			// 7. Preserve Framebuffer Alpha -> True (CRITICAL for DWM composition)
			PlayerSettings.preserveFramebufferAlpha = true;
			Debug.Log("- Preserve Framebuffer Alpha: True");
		}
	}
}
