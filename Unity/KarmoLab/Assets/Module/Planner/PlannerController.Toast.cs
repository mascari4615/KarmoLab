
using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoLab.Module.Planner
{
	public partial class PlannerController
	{
		private VisualElement _toastContainer;

		private void InitializeToast(VisualElement root)
		{
			_toastContainer = root.Q("ToastContainer");
		}

		public enum ToastType { Info, Warning, Error }

		public void ShowToast(string message, ToastType type = ToastType.Info)
		{
			if (_toastContainer == null) return;

			// Create Toast Element
			var toast = new VisualElement();
			toast.AddToClassList("toast-item");

			if (type == ToastType.Error) toast.AddToClassList("toast-error");
			else if (type == ToastType.Warning) toast.AddToClassList("toast-warning");
			else toast.AddToClassList("toast-info");

			var label = new Label(message);
			label.style.whiteSpace = WhiteSpace.Normal;
			toast.Add(label);

			_toastContainer.Add(toast);

			// UI Toolkit Scheduler (Works in Editor too)
			// Wait a bit to allow CSS to initialize state before adding 'show' class
			toast.schedule.Execute(() => toast.AddToClassList("show")).ExecuteLater(50);

			// Hide after 3 seconds
			toast.schedule.Execute(() =>
			{
				toast.RemoveFromClassList("show");
				// Remove after transition
				toast.schedule.Execute(() =>
				{
					if (_toastContainer.Contains(toast)) _toastContainer.Remove(toast);
				}).ExecuteLater(350);
			}).ExecuteLater(3000);
		}
	}
}
