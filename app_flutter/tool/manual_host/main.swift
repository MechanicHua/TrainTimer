import Cocoa
import FlutterMacOS

// Ensure the framework images are registered before Flutter resolves its default
// precompiled bundle and Dart opens the solver by its standard framework name.
guard let frameworks = Bundle.main.privateFrameworksURL,
      let dartBundle = Bundle(url: frameworks.appendingPathComponent("App.framework")),
      dartBundle.load() else {
  fatalError("The bundled Release App.framework could not be loaded")
}
precondition(tt_m2p_abi_version() == 1, "Unsupported bundled min2phase ABI")

// Experimental programmatic host for Command Line Tools. The production Runner
// and its platform bridges are compiled unchanged; only its @main attribute is
// removed in a temporary build copy by build-macos-prototype.sh.
func RegisterGeneratedPlugins(registry: FlutterPluginRegistry) {
  PathProviderPlugin.register(with: registry.registrar(forPlugin: "PathProviderPlugin"))
  // sqlite3's Dart loader uses the macOS system dylib. No Objective-C sqlite3
  // plugin or CocoaPods-generated source is needed by this experimental host.
}

let application = NSApplication.shared
let applicationDelegate = AppDelegate()
application.delegate = applicationDelegate
application.setActivationPolicy(.regular)

let applicationName = "TrainTimer Flutter Prototype"
let menuBar = NSMenu()
let applicationMenuItem = NSMenuItem()
let applicationMenu = NSMenu(title: applicationName)
applicationMenu.addItem(withTitle: "关于 \(applicationName)", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
applicationMenu.addItem(.separator())
applicationMenu.addItem(withTitle: "隐藏 \(applicationName)", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
applicationMenu.addItem(withTitle: "显示全部", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
applicationMenu.addItem(.separator())
applicationMenu.addItem(withTitle: "退出 \(applicationName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
applicationMenuItem.submenu = applicationMenu
menuBar.addItem(applicationMenuItem)

let editMenuItem = NSMenuItem()
let editMenu = NSMenu(title: "编辑")
editMenu.addItem(withTitle: "撤销", action: Selector(("undo:")), keyEquivalent: "z")
let redo = editMenu.addItem(withTitle: "重做", action: Selector(("redo:")), keyEquivalent: "Z")
redo.keyEquivalentModifierMask = [.command, .shift]
editMenu.addItem(.separator())
editMenu.addItem(withTitle: "剪切", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
editMenu.addItem(withTitle: "复制", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
editMenu.addItem(withTitle: "粘贴", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
editMenu.addItem(withTitle: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
editMenuItem.submenu = editMenu
menuBar.addItem(editMenuItem)
application.mainMenu = menuBar
applicationDelegate.applicationMenu = applicationMenu

let window = MainFlutterWindow(contentRect: NSRect(x: 0, y: 0, width: 1120, height: 780),
  styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
window.title = applicationName
window.minSize = NSSize(width: 760, height: 560)
window.isReleasedWhenClosed = false
window.center()
applicationDelegate.mainFlutterWindow = window
window.awakeFromNib()
window.makeKeyAndOrderFront(nil)
application.activate(ignoringOtherApps: true)
application.run()
