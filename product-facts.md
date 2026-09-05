# TrainTimer launcher facts

## Confirmed product scope

- `TrainTimer.app` is a native Cocoa/AppKit launcher whose editable UI source is `scripts/macos-launcher.m`.
- The launcher starts the bundled local Node.js service and, when the health check succeeds, opens the timer URL in Google Chrome.
- This redesign changes only the native launcher window and launcher menus. The timer webpage under `public/` and the packaged runtime copy remain outside the design scope.
- The user explicitly requires automatic Chrome opening to remain enabled.

## Confirmed platform facts

- The local Command Line Tools SDK is macOS 26.5.
- The existing launcher binary has deployment target macOS 26.0 and SDK 26.5.
- AppKit in this SDK provides `NSGlassEffectView`, `NSGlassEffectContainerView`, `NSBezelStyleGlass`, `NSControlSizeExtraLarge`, `NSTintProminence`, and `NSControlBorderShape` for macOS 26.

## Confirmed app icon facts

- Apple currently specifies a 1024×1024 square design canvas for iOS, iPadOS, and macOS app icons, with the rounded-rectangle enclosure applied by the system.
- Apple recommends layered icon construction: one background plus one or more foreground layers, using clearly defined foreground edges and vector SVG where possible.
- Liquid Glass properties such as specular highlights, refraction, translucency, blur, and inter-layer shadows should be configured in Icon Composer instead of being baked into source artwork.
- Source artwork prepared for Icon Composer should remain flat, opaque, simple, and split by Z-depth or color when that improves appearance control.
- Icon Composer supports Default, Dark, and Mono annotations and can generate clear and tinted appearances from the same layered structure.
- The current machine runs macOS 26.5.2 and has Apple Icon Composer 1.6 installed. The accepted Liquid Glass icon has a native `.icon` project and an exported 1024×1024 PNG.

## Confirmed Windows launcher facts

- The active Windows launcher is a native Win32 x64 application whose editable source is `windows/TrainTimer.Native/launcher.c`; the older WPF project is retained only as legacy reference.
- The native launcher uses only Windows system libraries and does not require or bundle a .NET runtime.
- It validates `/api/health` as TrainTimer before attaching, searches ports 3211–3240, and uses a Windows Job Object to stop only the process tree it created.
- The release package bundles `Resources/node/node.exe`, so the destination computer does not need a preinstalled Node.js runtime.
- The browser already loads `public/vendor/three.module.js`; the Windows package therefore omits the redundant `node_modules/three` copy.
- The Inno Setup build uses LZMA2 solid compression and installs per-user without administrator privileges.

## Design rules used

- Liquid Glass forms a functional layer for important controls and navigation; it should not become the main content background.
- Custom glass effects should be used sparingly, and nearby custom glass elements should share an `NSGlassEffectContainerView`.
- macOS 26 adds extra-large controls for the primary action, taller standard controls, control prominence, and refreshed menu symbols.
- Mac apps should expose commands through the menu bar and provide keyboard shortcuts for frequently used actions.

## Sources

- https://developer.apple.com/design/human-interface-guidelines/materials
- https://developer.apple.com/design/human-interface-guidelines/designing-for-macos/
- https://developer.apple.com/design/human-interface-guidelines/menus
- https://developer.apple.com/design/human-interface-guidelines/keyboards
- https://developer.apple.com/videos/play/wwdc2025/310/
- https://developer.apple.com/design/human-interface-guidelines/app-icons
- https://developer.apple.com/documentation/xcode/creating-your-app-icon-using-icon-composer
- https://developer.apple.com/videos/play/wwdc2025/220/
- https://developer.apple.com/videos/play/wwdc2025/361/
- Local SDK header: `AppKit.framework/Headers/NSGlassEffectView.h`
- https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmsetwindowattribute
