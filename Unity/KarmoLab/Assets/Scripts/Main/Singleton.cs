using UnityEngine;

namespace KarmoLab
{
	public abstract class Singleton<T> : MonoBehaviour where T : MonoBehaviour
	{
		private static T instance;

		public static T Instance
		{
			get
			{
				if (instance == null)
				{
					instance = FindFirstObjectByType<T>();
					if (instance == null)
					{
						GameObject obj = new()
						{
							name = typeof(T).Name
						};
						instance = obj.AddComponent<T>();
					}
				}
				return instance;
			}
		}

		protected virtual void Awake()
		{
			if (instance == null)
			{
				instance = this as T;
				DontDestroyOnLoad(gameObject);
			}
			else
			{
				Destroy(gameObject);
			}
		}
	}
}