namespace KarmoToys.Features.Companion.Modules
{
	public interface ICompanionModule
	{
		void Initialize(CompanionContext context);
		void Update();
		void OnDestroy();
	}
}
