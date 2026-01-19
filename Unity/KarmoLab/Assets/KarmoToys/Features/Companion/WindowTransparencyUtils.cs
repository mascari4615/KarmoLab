using System;
using System.Runtime.InteropServices;
using UnityEngine;

namespace KarmoToys.Features.Companion
{
#if UNITY_STANDALONE_WIN && !UNITY_EDITOR
	public static class WindowTransparencyUtils
	{
		// --- P/Invoke Definitions ---
		[DllImport("user32.dll")] private static extern IntPtr GetActiveWindow();

		[StructLayout(LayoutKind.Sequential)]
		public struct LASTINPUTINFO
		{
			public uint cbSize;
			public uint dwTime;
		}

		[DllImport("user32.dll")]
		private static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

		public static uint GetLastInputTime()
		{
#if UNITY_STANDALONE_WIN && !UNITY_EDITOR
			LASTINPUTINFO lastInputInfo = new LASTINPUTINFO();
			lastInputInfo.cbSize = (uint)Marshal.SizeOf(lastInputInfo);
			lastInputInfo.dwTime = 0;

			if (GetLastInputInfo(ref lastInputInfo))
			{
				return lastInputInfo.dwTime;
			}
#endif
			// Fallback for editor or fail
			return (uint)Environment.TickCount;
		}

		// Wrapper to get idle time in seconds
		public static float GetIdleTimeSeconds()
		{
#if UNITY_STANDALONE_WIN && !UNITY_EDITOR
			uint lastInputTick = GetLastInputTime();
			uint systemTick = (uint)Environment.TickCount; 
			// Note: TickCount wraps around every 49.7 days.
			// Simple subtraction works for duration if unchecked, but let's be safe.
			// Using long to handle potential wrap logic if needed, but uint subtraction is implicitly modulo 2^32.
			// uint duration = systemTick - lastInputTick;
			
			return (systemTick - lastInputTick) / 1000f;
#else
			// Mock for Editor: Track mouse movement manually?
			// Since we already have mouse polling in InteractionModule, 
			// InteractionModule could update a 'LastActivityTime'.
			// But for now, let's just use Input.anyKey logic for Editor.
			
			// Wait, GetLastInputInfo checks GLOBAL input (even outside window).
			// Input.anyKey only checks focused window.
			// In Editor, we only care about focus, so Input.anyKey is fine?
			// Actually, for a 'Desktop Companion', global input is key.
			// Simulating global idle in Editor is hard. Let's just return 0 (never idle) or implement a mock timer later.
			// For now, let's return a mock value that increases if no Input in Game View.
			return _editorIdleTimer; 
#endif
		}

#if UNITY_EDITOR // Mock Field
		private static float _editorIdleTimer = 0f;
		public static void UpdateEditorIdle() // Call this from Feature Update
		{
			if (Input.anyKey || Input.anyKeyDown || Input.GetAxis("Mouse X") != 0 || Input.GetAxis("Mouse Y") != 0)
			{
				_editorIdleTimer = 0f;
			}
			else
			{
				_editorIdleTimer += Time.deltaTime;
			}
		}
#endif
		[DllImport("user32.dll")] private static extern int SetWindowLong(IntPtr hWnd, int nIndex, uint dwNewLong);

		[DllImport("user32.dll")] private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

		[DllImport("user32.dll", SetLastError = true)] private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

		[DllImport("Dwmapi.dll")] private static extern uint DwmExtendFrameIntoClientArea(IntPtr hWnd, ref MARGINS margins);

		private struct MARGINS
		{
			public int cxLeftWidth;
			public int cxRightWidth;
			public int cyTopHeight;
			public int cyBottomHeight;
		}

		// --- Constants ---
		private const int GWL_STYLE = -16;
		private const int GWL_EXSTYLE = -20;

		private const uint WS_POPUP = 0x80000000;
		private const uint WS_VISIBLE = 0x10000000;
		private const uint WS_EX_LAYERED = 0x00080000;
		private const uint WS_EX_TRANSPARENT = 0x00000020;
		private const uint WS_EX_TOPMOST = 0x00000008;
		private const uint WS_EX_APPWINDOW = 0x00040000;

		private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
		private static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);

		private const uint SWP_FRAMECHANGED = 0x0020;
		private const uint SWP_NOMOVE = 0x0002;
		private const uint SWP_NOSIZE = 0x0001;
		private const uint SWP_SHOWWINDOW = 0x0040;

		/// <summary>
		/// Enables window transparency by removing borders and extending the glass frame.
		/// </summary>
		public static void EnableTransparency()
		{
			IntPtr hWnd = GetUnityWindowHandle();

			if (hWnd == IntPtr.Zero)
			{
				Debug.LogError("[WindowTransparencyUtils] Failed to get Active Window Handle!");
				return;
			}

			// 1. Remove Borders (Aggressively)
			// WS_CAPTION, WS_THICKFRAME, WS_MINIMIZEBOX, WS_MAXIMIZEBOX, WS_SYSMENU
			const int GWL_STYLE = -16;
			const uint WS_CAPTION = 0x00C00000;
			const uint WS_THICKFRAME = 0x00040000;
			const uint WS_SYSMENU = 0x00080000;
			const uint WS_MINIMIZEBOX = 0x00020000;
			const uint WS_MAXIMIZEBOX = 0x00010000;
			const uint WS_POPUP = 0x80000000;
			
			// Get style as int, convert to uint for bitwise ops
			uint style = (uint)GetWindowLong(hWnd, GWL_STYLE);
			
			// Remove caption, thickframe, etc.
			style &= ~(WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX);
			
			// Add Popup
			style |= WS_POPUP; 
			
			// Set new style
			SetWindowLong(hWnd, GWL_STYLE, style);

			// 2. Extend glass into client area (Transparent effect)
			MARGINS margins = new MARGINS { cxLeftWidth = -1 };
			int hr = (int)DwmExtendFrameIntoClientArea(hWnd, ref margins);
			if (hr != 0) Debug.LogError($"[WindowTransparencyUtils] DwmExtendFrameIntoClientArea Failed: {hr}");

			// 3. Add Layered and Transparent styles
			// Note: For DWM transparency to work in a windowed app, we often don't need WS_EX_TRANSPARENT unless we want click-through.
			// But we DO need WS_EX_LAYERED mostly for SetLayeredWindowAttributes (which we aren't using, we use DwmExtendFrame).
			// However, some Unity versions/drivers require WS_EX_LAYERED | WS_EX_TRANSPARENT for the background to clear properly?
			// Actually, just DwmExtendFrame + Alpha Clear on Camera is usually enough for visual transparency.
			// Let's stick to the standard approach:
			int exStyle = GetWindowLong(hWnd, GWL_EXSTYLE);
			SetWindowLong(hWnd, GWL_EXSTYLE, (uint)(exStyle | WS_EX_LAYERED));

			// 4. Set Position and Size to Work Area, and Trigger a refresh
			RECT workArea = new RECT();
			SystemParametersInfo(0x0030, 0, ref workArea, 0); // SPI_GETWORKAREA
			int width = workArea.Right - workArea.Left;
			int height = workArea.Bottom - workArea.Top;

			SetWindowPos(hWnd, IntPtr.Zero, workArea.Left, workArea.Top, width, height, SWP_FRAMECHANGED | SWP_SHOWWINDOW);

			Debug.Log($"[WindowTransparencyUtils] Transparency Applied. Resolution: {width}x{height}, hWnd: {hWnd}");
		}

		/// <summary>
		/// Toggles click-through behavior.
		/// If true, mouse inputs pass through the window.
		/// If false, the window blocks mouse inputs.
		/// </summary>
		public static void SetClickThrough(bool isClickThrough)
		{
			IntPtr hWnd = GetUnityWindowHandle();
			int exStyle = GetWindowLong(hWnd, GWL_EXSTYLE);

			if (isClickThrough)
			{
				// Add WS_EX_TRANSPARENT
				SetWindowLong(hWnd, GWL_EXSTYLE, (uint)(exStyle | WS_EX_TRANSPARENT));
			}
			else
			{
				// Remove WS_EX_TRANSPARENT
				SetWindowLong(hWnd, GWL_EXSTYLE, (uint)(exStyle & ~WS_EX_TRANSPARENT));
			}
		}

		/// <summary>
		/// Toggles Always On Top behavior.
		/// </summary>
		public static void SetAlwaysOnTop(bool isAlwaysOnTop)
		{
			IntPtr hWnd = GetUnityWindowHandle();
			IntPtr hWndInsertAfter = isAlwaysOnTop ? HWND_TOPMOST : HWND_NOTOPMOST;
			SetWindowPos(hWnd, hWndInsertAfter, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
		}
		// --- SPI Definitions ---
		private const int SPI_GETWORKAREA = 0x0030;

		[DllImport("user32.dll", SetLastError = true)]
		[return: MarshalAs(UnmanagedType.Bool)]
		private static extern bool SystemParametersInfo(int uiAction, int uiParam, ref RECT pvParam, int fWinIni);

		[StructLayout(LayoutKind.Sequential)]
		public struct RECT
		{
			public int Left;
			public int Top;
			public int Right;
			public int Bottom;
		}

		// --- Input Helpers ---
		[DllImport("user32.dll")]
		[return: MarshalAs(UnmanagedType.Bool)]
		private static extern bool GetCursorPos(out POINT lpPoint);

		[DllImport("user32.dll")]
		public static extern bool ScreenToClient(IntPtr hWnd, ref POINT lpPoint);

		[StructLayout(LayoutKind.Sequential)]
		public struct POINT
		{
			public int X;
			public int Y;
		}

		public static Vector2 GetCursorPosition(bool relativeToWindow = true)
		{
			POINT p;
			if (GetCursorPos(out p))
			{
				if (relativeToWindow)
				{
					// Ensure we have the cached handle
					GetUnityWindowHandle();
				}
				return new Vector2(p.X, p.Y);
			}
			return Vector2.zero;
		}

		[DllImport("user32.dll", SetLastError = true)]
		private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

		private static IntPtr _cachedHWnd = IntPtr.Zero;
		
		public static IntPtr GetUnityWindowHandle()
		{
			if (_cachedHWnd != IntPtr.Zero) return _cachedHWnd;
			
			// Priority: FindWindow by name (most reliable for Standalone)
			_cachedHWnd = FindWindow(null, Application.productName);
			
			// Fallback: GetActiveWindow (might fail if user clicked away)
			if (_cachedHWnd == IntPtr.Zero)
				_cachedHWnd = GetActiveWindow();

			return _cachedHWnd;
		}

	public static Vector2 GetMousePosInWindow()
		{
			IntPtr hWnd = GetUnityWindowHandle();
			if (hWnd == IntPtr.Zero) return Vector2.zero; // Logic fail if no hWnd cached

			POINT p;
			GetCursorPos(out p);
			ScreenToClient(hWnd, ref p);
			return new Vector2(p.X, p.Y);
		}

		[DllImport("user32.dll")]
		private static extern short GetAsyncKeyState(int vKey);

		public static bool IsLeftMouseButtonDown()
		{
			// 0x01 is VK_LBUTTON
			return (GetAsyncKeyState(0x01) & 0x8000) != 0;
		}

		public static Rect GetWorkArea()
		{
			RECT rect = new RECT();
			if (SystemParametersInfo(SPI_GETWORKAREA, 0, ref rect, 0))
			{
				return new Rect(rect.Left, rect.Top, rect.Right - rect.Left, rect.Bottom - rect.Top);
			}
			// Fallback to full screen if failed
			return new Rect(0, 0, Screen.currentResolution.width, Screen.currentResolution.height);
		}
	}
#else
	public static class WindowTransparencyUtils
	{
		private static float _editorIdleTimer = 0f;

		public static void EnableTransparency() { Debug.Log("[WindowTransparencyUtils] EnableTransparency called (Mock)."); }
		public static void SetClickThrough(bool b) { /* Too spammy */ }
		public static void SetAlwaysOnTop(bool b) { /* Too spammy */ }
		public static Rect GetWorkArea() { return new Rect(0, 0, 1920, 1080); }
		public static Vector2 GetMousePosInWindow()
		{
			Vector2 pos = Input.mousePosition;
			return new Vector2(pos.x, Screen.height - pos.y);
		}

		public static bool IsLeftMouseButtonDown()
		{
			return Input.GetMouseButton(0);
		}

		public static void UpdateEditorIdle()
		{
			// Reset idle timer on any SIGNIFICANT input
			if (Input.anyKey || Input.anyKeyDown ||
				Mathf.Abs(Input.GetAxis("Mouse X")) > 1.0f ||
				Mathf.Abs(Input.GetAxis("Mouse Y")) > 1.0f)
			{
				_editorIdleTimer = 0f;
			}
			else
			{
				_editorIdleTimer += Time.deltaTime;
			}
		}

		public static float GetIdleTimeSeconds()
		{
			return _editorIdleTimer;
		}
	}
#endif
}
