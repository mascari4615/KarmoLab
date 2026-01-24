using UnityEngine.UIElements;
using KarmoToys.Common;

namespace KarmoToys.Features.Companion.Modules
{
	public enum CompanionState
	{
		Normal,
		Sleeping,
		// Future: Busy, Gaming, etc.
	}

	public class CompanionContext
	{
		public VisualElement RootUI { get; set; }
		public IDragHandler SelectedAvatar { get; set; }
		public KarmoToysSettings Settings { get; set; }
		public VisualElement ViewContainer { get; set; } // The main container for UI interactions

		public CompanionState CurrentState { get; set; } = CompanionState.Normal;

		// Shared State
		public bool IsDragging { get; set; }
		public bool IsDragging3D { get; set; }

		// Helper to find specific UI elements
		public T GetUIElement<T>(string name) where T : VisualElement => RootUI?.Q<T>(name);
	}
}
