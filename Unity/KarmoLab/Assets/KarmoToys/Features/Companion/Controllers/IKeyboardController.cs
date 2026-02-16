using KarmoToys.Features.Companion.UI;

namespace KarmoToys.Features.Companion.Controllers
{
    public interface IKeyboardController
    {
        void Initialize(KeyboardView view);
        void OnUpdate();
        void OnDisable();
    }
}
