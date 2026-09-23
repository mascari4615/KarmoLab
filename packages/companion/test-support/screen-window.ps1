param([switch]$ReadOnly)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class ScreenFixtureNative {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int index);
  [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h, int index, int value);
}
'@

# Transparent, non-activating, mouse-transparent owned fixture. No user input.
$window = New-Object System.Windows.Window
$window.Title = 'CompanionScreenFixture'
$window.Width = 240
$window.Height = 140
$window.WindowStyle = 'None'
$window.ResizeMode = 'NoResize'
$window.ShowActivated = $false
$window.ShowInTaskbar = $false
$window.AllowsTransparency = $true
$window.Opacity = 0
$panel = New-Object System.Windows.Controls.StackPanel
$label = New-Object System.Windows.Controls.TextBlock
$label.Text = 'Fixture text'
[void]$panel.Children.Add($label)
if (!$ReadOnly) {
  $button = New-Object System.Windows.Controls.Button
  $button.Content = 'Fixture button'
  [void]$panel.Children.Add($button)
  $toggle = New-Object System.Windows.Controls.CheckBox
  $toggle.Content = 'Fixture toggle'
  [void]$panel.Children.Add($toggle)
}
$window.Content = $panel
$window.Add_SourceInitialized({
  $handle = (New-Object System.Windows.Interop.WindowInteropHelper $window).Handle
  $style = [ScreenFixtureNative]::GetWindowLong($handle, -20)
  # WS_EX_NOACTIVATE | WS_EX_TRANSPARENT
  [void][ScreenFixtureNative]::SetWindowLong($handle, -20, ($style -bor 0x08000020))
})
$window.Add_ContentRendered({
  $handle = (New-Object System.Windows.Interop.WindowInteropHelper $window).Handle
  if ([ScreenFixtureNative]::GetForegroundWindow() -eq $handle) {
    throw 'Fixture acquired foreground focus'
  }
  [Console]::WriteLine('READY=' + $handle.ToInt64())
  [Console]::Out.Flush()
})
# A crashed test caller must not leave its fixture running indefinitely.
$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromSeconds(90)
$timer.Add_Tick({ $window.Close() })
$timer.Start()
$window.ShowDialog() | Out-Null
