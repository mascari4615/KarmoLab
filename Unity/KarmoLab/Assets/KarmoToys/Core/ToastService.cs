using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoToys.Core
{
	public enum ToastType { Info, Warning, Error }

	public class ToastService
	{
		private VisualElement _container;

		public ToastService(VisualElement container)
		{
			_container = container;
		}

		public void Show(string message, ToastType type = ToastType.Info)
		{
			if (_container == null)
			{
				Debug.LogWarning($"[ToastService] Container is null. Message: {message}");
				return;
			}

			// Create Toast Element
			VisualElement toast = new VisualElement();
			toast.AddToClassList("toast-item");

			if (type == ToastType.Error) toast.AddToClassList("toast-error");
			else if (type == ToastType.Warning) toast.AddToClassList("toast-warning");
			else toast.AddToClassList("toast-info");

			Label label = new Label(message);
			label.style.whiteSpace = WhiteSpace.Normal;
			toast.Add(label);

			_container.Add(toast);

			// UI Toolkit Scheduler
			toast.schedule.Execute(() => toast.AddToClassList("show")).ExecuteLater(50);

			// Hide after 3 seconds
			toast.schedule.Execute(() =>
			{
				toast.RemoveFromClassList("show");
				toast.schedule.Execute(() =>
				{
					if (_container.Contains(toast)) _container.Remove(toast);
				}).ExecuteLater(350);
			}).ExecuteLater(3000);
		}
	}
}
