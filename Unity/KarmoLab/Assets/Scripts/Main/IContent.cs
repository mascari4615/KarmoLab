using UnityEngine;
using TMPro;
using UnityEngine.UI;
using System;
using System.Collections.Generic;

namespace KarmoLab
{
	public abstract class Content : MonoBehaviour
	{
		public abstract void Init();
		public abstract void Show();
		public abstract void Hide();
	}
}