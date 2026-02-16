using System;
using UnityEngine;
using KarmoToys.Features.Companion.Modules;
using KarmoToys.Features.Companion.UI;

namespace KarmoToys.Features.Companion.Controllers
{
    public class RealtimeInputController : IKeyboardController
    {
        private KeyboardView _view;
        private KeyboardModule _module;

        public RealtimeInputController(KeyboardModule module)
        {
            _module = module;
        }

        public void Initialize(KeyboardView view)
        {
            _view = view;
            if (_module != null)
            {
                _module.OnKeyStateChanged += HandleKeyStateChanged;
            }
        }

        public void OnUpdate()
        {
            // Future implementation: Particle effects or animations
        }

        public void OnDisable()
        {
            if (_module != null)
            {
                _module.OnKeyStateChanged -= HandleKeyStateChanged;
            }
        }

        private void HandleKeyStateChanged(int vkCode, bool isDown)
        {
            if (_view == null) return;
            
            // Update the visual state of the key
            _view.SetKeyActive(vkCode, isDown);
        }
    }
}
