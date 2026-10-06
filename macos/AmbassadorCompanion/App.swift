import AppKit

@main
final class AmbassadorApp: NSObject, NSApplicationDelegate {
    private var window: NSWindow!
    private var workspace: WorkspaceController!
    private let smokeTest = CommandLine.arguments.contains("--smoke-test")

    static func main() {
        let app = NSApplication.shared
        let delegate = AmbassadorApp()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        withExtendedLifetime(delegate) { app.run() }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        workspace = WorkspaceController(smokeTest: smokeTest)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "Ambassador Companion"
        window.contentMinSize = NSSize(width: 760, height: 520)
        window.contentViewController = workspace
        window.toolbar = workspace.makeToolbar()
        window.toolbarStyle = .unified
        window.isReleasedWhenClosed = false
        window.collectionBehavior = [.fullScreenPrimary]
        window.center()
        if !smokeTest { window.setFrameAutosaveName("AmbassadorWorkspaceWindow") }
        buildMenus()
        if smokeTest {
            workspace.onReady = { [weak self] in
                guard let self = self else { return }
                self.workspace.onReady = nil
                NativeSmokeTests.run(window: self.window, workspace: self.workspace)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 90) {
                fputs("FAIL: native smoke test timed out\n", stderr); exit(1)
            }
        }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window.makeKeyAndOrderFront(nil)
        return true
    }
    @objc private func showWorkspace(_ sender: Any?) { window.makeKeyAndOrderFront(nil) }
    @objc private func openSupport(_ sender: Any?) {
        NSWorkspace.shared.open(WorkspacePolicy.publicURL.appendingPathComponent("support.html"))
    }
    @objc private func openPrivacy(_ sender: Any?) {
        NSWorkspace.shared.open(WorkspacePolicy.publicURL.appendingPathComponent("privacy.html"))
    }

    private func buildMenus() {
        let main = NSMenu()
        func menu(_ title: String) -> NSMenu {
            let item = NSMenuItem(); item.title = title
            let submenu = NSMenu(title: title); item.submenu = submenu; main.addItem(item)
            return submenu
        }
        func item(_ menu: NSMenu, _ title: String, _ action: Selector?, _ key: String = "",
                  target: AnyObject? = nil, modifiers: NSEvent.ModifierFlags = [.command]) -> NSMenuItem {
            let result = NSMenuItem(title: title, action: action, keyEquivalent: key)
            result.target = target; result.keyEquivalentModifierMask = modifiers
            menu.addItem(result); return result
        }
        let app = menu("Ambassador Companion")
        item(app, "About Ambassador Companion", #selector(NSApplication.orderFrontStandardAboutPanel(_:)))
        app.addItem(.separator())
        let services = NSMenu(title: "Services")
        item(app, "Services", nil).submenu = services
        NSApp.servicesMenu = services
        app.addItem(.separator())
        item(app, "Hide Ambassador Companion", #selector(NSApplication.hide(_:)), "h")
        item(app, "Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", modifiers: [.command, .option])
        item(app, "Show All", #selector(NSApplication.unhideAllApplications(_:)))
        app.addItem(.separator())
        item(app, "Quit Ambassador Companion", #selector(NSApplication.terminate(_:)), "q")

        let file = menu("File")
        item(file, "Show Workspace", #selector(showWorkspace(_:)), "n", target: self)
        item(file, "Close Window", #selector(NSWindow.performClose(_:)), "w")
        file.addItem(.separator())
        item(file, "Print…", #selector(WorkspaceController.printPage(_:)), "p", target: workspace)

        let edit = menu("Edit")
        item(edit, "Undo", Selector(("undo:")), "z")
        item(edit, "Redo", Selector(("redo:")), "z", modifiers: [.command, .shift])
        edit.addItem(.separator())
        item(edit, "Cut", #selector(NSText.cut(_:)), "x")
        item(edit, "Copy", #selector(NSText.copy(_:)), "c")
        item(edit, "Paste", #selector(NSText.paste(_:)), "v")
        item(edit, "Select All", #selector(NSText.selectAll(_:)), "a")
        edit.addItem(.separator())
        item(edit, "Find in Page…", #selector(WorkspaceController.focusFind(_:)), "f", target: workspace)
        item(edit, "Find Next", #selector(WorkspaceController.findNext(_:)), "g", target: workspace)
        item(edit, "Find Previous", #selector(WorkspaceController.findPrevious(_:)), "g", target: workspace, modifiers: [.command, .shift])

        let view = menu("View")
        item(view, "Toggle Sidebar", #selector(NSSplitViewController.toggleSidebar(_:)), "s", target: workspace, modifiers: [.command, .control])
        item(view, "Reload Workspace", #selector(WorkspaceController.reloadWorkspace(_:)), "r", target: workspace)
        view.addItem(.separator())
        item(view, "Zoom In", #selector(WorkspaceController.zoomIn(_:)), "+", target: workspace)
        item(view, "Zoom Out", #selector(WorkspaceController.zoomOut(_:)), "-", target: workspace)
        item(view, "Actual Size", #selector(WorkspaceController.actualSize(_:)), "0", target: workspace)
        view.addItem(.separator())
        item(view, "Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", modifiers: [.command, .control])

        let go = menu("Go")
        item(go, "Back", #selector(WorkspaceController.goBack(_:)), "[", target: workspace)
        item(go, "Forward", #selector(WorkspaceController.goForward(_:)), "]", target: workspace)
        go.addItem(.separator())
        for (index, destination) in WorkspaceDestination.all.enumerated() {
            item(go, destination.title, #selector(WorkspaceController.navigateMenu(_:)),
                 index < 9 ? String(index + 1) : "", target: workspace).representedObject = destination.id
        }

        let windows = menu("Window")
        item(windows, "Minimize", #selector(NSWindow.performMiniaturize(_:)), "m")
        item(windows, "Zoom", #selector(NSWindow.performZoom(_:)))
        windows.addItem(.separator())
        item(windows, "Bring All to Front", #selector(NSApplication.arrangeInFront(_:)))
        NSApp.windowsMenu = windows
        let help = menu("Help")
        item(help, "Ambassador Companion Support", #selector(openSupport(_:)), target: self)
        item(help, "Privacy Policy", #selector(openPrivacy(_:)), target: self)
        NSApp.helpMenu = help
        NSApp.mainMenu = main
    }
}
