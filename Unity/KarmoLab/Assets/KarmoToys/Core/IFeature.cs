using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoToys.Core
{
	public interface IFeature
	{
		string FeatureName { get; }
		string TabButtonName { get; }

		void Initialize(VisualElement root);
		void OnSelect();
		void OnDeselect();
	}
}
