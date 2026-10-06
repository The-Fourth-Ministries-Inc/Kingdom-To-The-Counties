import AppKit
import WebKit

final class SidebarController: NSViewController, NSTableViewDataSource, NSTableViewDelegate {
    let table = NSTableView()
    var onSelect: ((WorkspaceDestination) -> Void)?
    private var updating = false

    override func loadView() {
        let background = NSVisualEffectView()
        background.material = .sidebar
        background.blendingMode = .behindWindow
        let scroll = NSScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.drawsBackground = false
        scroll.hasVerticalScroller = true
        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("destination"))
        column.resizingMask = .autoresizingMask
        table.addTableColumn(column)
        table.columnAutoresizingStyle = .lastColumnOnlyAutoresizingStyle
        table.headerView = nil
        table.style = .sourceList
        table.rowHeight = 44
        table.backgroundColor = .clear
        table.delegate = self
        table.dataSource = self
        table.allowsEmptySelection = false
        table.setAccessibilityLabel("Workspace navigation")
        scroll.documentView = table
        background.addSubview(scroll)
        NSLayoutConstraint.activate([
            scroll.leadingAnchor.constraint(equalTo: background.leadingAnchor, constant: 8),
            scroll.trailingAnchor.constraint(equalTo: background.trailingAnchor, constant: -8),
            scroll.topAnchor.constraint(equalTo: background.topAnchor, constant: 12),
            scroll.bottomAnchor.constraint(equalTo: background.bottomAnchor, constant: -12)
        ])
        view = background
    }

    func numberOfRows(in tableView: NSTableView) -> Int { WorkspaceDestination.all.count }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let destination = WorkspaceDestination.all[row]
        let cell = NSTableCellView()
        let label = NSTextField(labelWithString: destination.title)
        let icon = NSImageView(image: NSImage(systemSymbolName: destination.symbol,
                                             accessibilityDescription: destination.title) ?? NSImage())
        label.font = .systemFont(ofSize: 13, weight: .medium)
        label.lineBreakMode = .byTruncatingTail
        label.translatesAutoresizingMaskIntoConstraints = false
        icon.translatesAutoresizingMaskIntoConstraints = false
        icon.contentTintColor = .controlAccentColor
        cell.addSubview(label)
        cell.addSubview(icon)
        cell.textField = label
        cell.imageView = icon
        NSLayoutConstraint.activate([
            icon.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 8),
            icon.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
            icon.widthAnchor.constraint(equalToConstant: 20),
            icon.heightAnchor.constraint(equalToConstant: 20),
            label.leadingAnchor.constraint(equalTo: icon.trailingAnchor, constant: 10),
            label.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -8),
            label.centerYAnchor.constraint(equalTo: cell.centerYAnchor)
        ])
        return cell
    }

    func tableViewSelectionDidChange(_ notification: Notification) {
        guard !updating, WorkspaceDestination.all.indices.contains(table.selectedRow) else { return }
        onSelect?(WorkspaceDestination.all[table.selectedRow])
    }

    func select(page: String, parent: String) {
        guard let row = WorkspaceDestination.all.firstIndex(where: { $0.id == page })
            ?? WorkspaceDestination.all.firstIndex(where: { $0.id == parent }) else { return }
        updating = true
        table.selectRowIndexes(IndexSet(integer: row), byExtendingSelection: false)
        updating = false
    }
}

final class WorkspaceController: NSSplitViewController, WKNavigationDelegate,
    WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate, NSToolbarDelegate {
    let sidebar = SidebarController()
    private(set) var webView: WKWebView!
    let searchField = NSSearchField()
    var onReady: (() -> Void)?
    private var pendingDestination = "now"
    private var ready = false
    private let smokeTest: Bool
    private var downloadPanels: [ObjectIdentifier: NSSavePanel] = [:]
    private var downloadDestinations: [ObjectIdentifier: (URL, URL)] = [:]

    init(smokeTest: Bool = false) {
        self.smokeTest = smokeTest
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        splitView.isVertical = true
        splitView.autosaveName = "AmbassadorWorkspaceSplit"
        let sidebarItem = NSSplitViewItem(sidebarWithViewController: sidebar)
        sidebarItem.minimumThickness = 200
        sidebarItem.maximumThickness = 300
        sidebarItem.canCollapse = true
        addSplitViewItem(sidebarItem)

        let resourceRoot = Bundle.main.resourceURL!
        let config = WKWebViewConfiguration()
        config.websiteDataStore = smokeTest ? .nonPersistent() : .default()
        config.setURLSchemeHandler(BundleSchemeHandler(root: resourceRoot.appendingPathComponent("www")),
                                   forURLScheme: WorkspacePolicy.scheme)
        let controller = config.userContentController
        controller.add(self, name: "workspace")
        controller.addUserScript(WKUserScript(
            source: "window.K2C_DESKTOP=true;",
            injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let css = (try? String(contentsOf: resourceRoot.appendingPathComponent("desktop.css"), encoding: .utf8)) ?? ""
        let script = (try? String(contentsOf: resourceRoot.appendingPathComponent("desktop.js"), encoding: .utf8)) ?? ""
        let styleScript = "var s=document.createElement('style');s.textContent=\(WorkspacePolicy.scriptString(css));document.head.appendChild(s);"
        controller.addUserScript(WKUserScript(source: styleScript + script,
                                              injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        // Smoke tests never read production data, request a PIN or send writes.
        if smokeTest {
            controller.addUserScript(WKUserScript(source: "(function(){var bundledFetch=window.fetch.bind(window);window.fetch=function(input,options){var url=new URL(typeof input==='string'?input:input.url,location.href);if(url.protocol==='capacitor:'&&url.hostname==='localhost'&&(!options||!options.method||options.method==='GET'))return bundledFetch(input,options);return Promise.reject(new Error('Offline native smoke test'));};navigator.sendBeacon=function(){return false;};})();",
                                                  injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.setAccessibilityLabel("Ambassador workspace")
        let detail = NSViewController()
        detail.view = webView
        let detailItem = NSSplitViewItem(viewController: detail)
        detailItem.minimumThickness = 500
        addSplitViewItem(detailItem)
        sidebar.onSelect = { [weak self] destination in self?.navigate(destination.id) }
        webView.load(URLRequest(url: WorkspacePolicy.appURL))
    }

    func makeToolbar() -> NSToolbar {
        let toolbar = NSToolbar(identifier: "AmbassadorWorkspaceToolbar")
        toolbar.delegate = self
        toolbar.displayMode = .iconOnly
        toolbar.allowsUserCustomization = true
        toolbar.autosavesConfiguration = true
        return toolbar
    }

    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.toggleSidebar, .flexibleSpace, .space, .init("back"), .init("forward"), .init("find"), .init("reload")]
    }
    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.toggleSidebar, .init("back"), .init("forward"), .flexibleSpace, .init("find"), .init("reload")]
    }
    func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier identifier: NSToolbarItem.Identifier,
                 willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        if identifier.rawValue == "find" {
            let item = NSToolbarItem(itemIdentifier: identifier)
            searchField.placeholderString = "Find in page"
            searchField.sendsWholeSearchString = true
            searchField.target = self
            searchField.action = #selector(findNext(_:))
            searchField.setAccessibilityLabel("Find in page")
            searchField.frame = NSRect(x: 0, y: 0, width: 210, height: 26)
            item.view = searchField
            item.label = "Find in Page"
            return item
        }
        let specs: [String: (String, String, Selector)] = [
            "back": ("Back", "chevron.left", #selector(goBack(_:))),
            "forward": ("Forward", "chevron.right", #selector(goForward(_:))),
            "reload": ("Reload Workspace", "arrow.clockwise", #selector(reloadWorkspace(_:)))
        ]
        guard let (label, symbol, action) = specs[identifier.rawValue] else { return nil }
        let item = NSToolbarItem(itemIdentifier: identifier)
        item.label = label
        item.toolTip = label
        item.image = NSImage(systemSymbolName: symbol, accessibilityDescription: label)
        item.target = self
        item.action = action
        return item
    }

    func navigate(_ page: String) {
        guard WorkspaceDestination.all.contains(where: { $0.id == page }) else { return }
        pendingDestination = page
        guard ready else { return }
        webView.evaluateJavaScript("window.K2CMac.navigate(\(WorkspacePolicy.scriptString(page)))", completionHandler: nil)
    }
    @objc func navigateMenu(_ sender: NSMenuItem) {
        guard let page = sender.representedObject as? String else { return }
        navigate(page)
    }
    @objc func goBack(_ sender: Any?) { webView.evaluateJavaScript("window.K2CMac.back()", completionHandler: nil) }
    @objc func goForward(_ sender: Any?) { webView.evaluateJavaScript("window.K2CMac.forward()", completionHandler: nil) }
    @objc func reloadWorkspace(_ sender: Any?) { ready = false; webView.reload() }
    @objc func focusFind(_ sender: Any?) { view.window?.makeFirstResponder(searchField) }
    @objc func findNext(_ sender: Any?) { find(backwards: false) }
    @objc func findPrevious(_ sender: Any?) { find(backwards: true) }
    private func find(backwards: Bool) {
        guard !searchField.stringValue.isEmpty else { focusFind(nil); return }
        let config = WKFindConfiguration()
        config.backwards = backwards
        config.wraps = true
        webView.find(searchField.stringValue, configuration: config) { result in
            if !result.matchFound { NSSound.beep() }
        }
    }
    @objc func zoomIn(_ sender: Any?) { webView.pageZoom = min(2, webView.pageZoom + 0.1) }
    @objc func zoomOut(_ sender: Any?) { webView.pageZoom = max(0.75, webView.pageZoom - 0.1) }
    @objc func actualSize(_ sender: Any?) { webView.pageZoom = 1 }
    @objc func printPage(_ sender: Any?) {
        webView.evaluateJavaScript("(function(){var id=pageId();if(id==='techio'&&typeof ioPrint==='function'){ioPrint();}else if(['playbook','handbook','church'].indexOf(id)>=0){printDoc(id);}else{window.print();}})()", completionHandler: nil)
    }
    private func performPrint() {
        let operation = webView.printOperation(with: NSPrintInfo.shared)
        operation.showsPrintPanel = true
        operation.showsProgressPanel = true
        operation.run()
        webView.evaluateJavaScript("window.dispatchEvent(new Event('afterprint'))", completionHandler: nil)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              let url = message.frameInfo.request.url, WorkspacePolicy.isBundled(url),
              let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        if type == "navigation", let page = body["page"] as? String {
            let parent = body["parent"] as? String ?? page
            // Reload should keep the last sidebar destination after navigation
            // through shared content or Back/Forward, too.
            pendingDestination = WorkspaceDestination.all.contains(where: { $0.id == page }) ? page : parent
            sidebar.select(page: page, parent: parent)
            let destination = WorkspaceDestination.all.first(where: { $0.id == page })
                ?? WorkspaceDestination.all.first(where: { $0.id == parent })
            view.window?.subtitle = destination?.title ?? "Workspace"
        } else if type == "print" { performPrint() }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        ready = true
        navigate(pendingDestination)
        onReady?()
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showError("The workspace could not open.", detail: error.localizedDescription)
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { reloadWorkspace(nil) }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if navigationAction.shouldPerformDownload, WorkspacePolicy.isBundled(url) {
            // WKDownload uses the network process, which cannot read custom
            // scheme-handler resources. Save bundled files directly instead.
            decisionHandler(.cancel)
            presentBundledDownload(url)
            return
        }
        if navigationAction.shouldPerformDownload, url.absoluteString.hasPrefix("blob:capacitor://localhost/") {
            decisionHandler(.download); return
        }
        if WorkspacePolicy.isBundled(url) {
            if navigationAction.targetFrame?.isMainFrame != false,
               !["", "/", "/index.html"].contains(url.path) {
                // Privacy/support and documents open outside the main app so
                // their navigation cannot erase unsent fields or the outbox.
                if navigationAction.navigationType == .linkActivated {
                    NSWorkspace.shared.open(WorkspacePolicy.publicURL.appendingPathComponent(url.path))
                }
                decisionHandler(.cancel); return
            }
            decisionHandler(.allow); return
        }
        // Links and user-initiated window.open from bundled content open in
        // the default browser. Cross-origin redirects never replace the app.
        if navigationAction.navigationType == .linkActivated || navigationAction.targetFrame == nil
            || ["mailto", "tel", "sms"].contains(url.scheme?.lowercased() ?? ""),
           navigationAction.sourceFrame.isMainFrame,
           let source = navigationAction.sourceFrame.request.url, WorkspacePolicy.isBundled(source),
           WorkspacePolicy.canOpenExternally(url) { NSWorkspace.shared.open(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.sourceFrame.isMainFrame,
           let source = navigationAction.sourceFrame.request.url, WorkspacePolicy.isBundled(source),
           let url = navigationAction.request.url, WorkspacePolicy.canOpenExternally(url) {
            NSWorkspace.shared.open(url)
        }
        return nil
    }
    func saveBundledResource(_ url: URL, to destination: URL) throws {
        let root = Bundle.main.resourceURL!.appendingPathComponent("www")
        guard let source = WorkspacePolicy.resourceURL(for: url, root: root) else {
            throw URLError(.noPermissionsToReadFile)
        }
        let scoped = destination.startAccessingSecurityScopedResource()
        defer { if scoped { destination.stopAccessingSecurityScopedResource() } }
        try Data(contentsOf: source).write(to: destination, options: .atomic)
    }
    private func presentBundledDownload(_ url: URL) {
        guard let window = view.window else { return }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = url.lastPathComponent
        panel.canCreateDirectories = true
        panel.beginSheetModal(for: window) { [weak self] result in
            guard result == .OK, let destination = panel.url, let self = self else { return }
            do { try self.saveBundledResource(url, to: destination) }
            catch { self.showError("The file could not be saved.", detail: error.localizedDescription) }
        }
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = (suggestedFilename as NSString).lastPathComponent
        panel.canCreateDirectories = true
        let key = ObjectIdentifier(download)
        downloadPanels[key] = panel
        guard let window = view.window else { downloadPanels.removeValue(forKey: key); completionHandler(nil); return }
        panel.beginSheetModal(for: window) { [weak self] result in
            guard let self = self else { completionHandler(nil); return }
            self.downloadPanels.removeValue(forKey: key)
            guard result == .OK, let destination = panel.url else { completionHandler(nil); return }
            // WKDownload requires a non-existing destination. Download to an
            // app-owned temporary file, then atomically replace only after the
            // Save panel has obtained the user's overwrite confirmation.
            let staging = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            self.downloadDestinations[key] = (staging, destination)
            completionHandler(staging)
        }
    }
    func downloadDidFinish(_ download: WKDownload) {
        guard let (staging, destination) = downloadDestinations.removeValue(forKey: ObjectIdentifier(download)) else { return }
        defer { try? FileManager.default.removeItem(at: staging) }
        let scoped = destination.startAccessingSecurityScopedResource()
        defer { if scoped { destination.stopAccessingSecurityScopedResource() } }
        do {
            // Atomic Data.write replaces an existing file only after data is
            // complete, retaining the original if the download fails.
            try Data(contentsOf: staging).write(to: destination, options: .atomic)
        } catch { showError("The file could not be saved.", detail: error.localizedDescription) }
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let (staging, _) = downloadDestinations.removeValue(forKey: ObjectIdentifier(download)) {
            try? FileManager.default.removeItem(at: staging)
        }
        showError("The download did not finish.", detail: error.localizedDescription)
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        guard frame.isMainFrame, let url = frame.request.url, WorkspacePolicy.isBundled(url),
              let window = view.window else { completionHandler(nil); return }
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.beginSheetModal(for: window) { response in completionHandler(response == .OK ? panel.urls : nil) }
    }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let trusted = frame.isMainFrame && origin.protocol == WorkspacePolicy.scheme && origin.host == "localhost"
        decisionHandler(trusted && !smokeTest ? .prompt : .deny)
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert(); alert.messageText = message; alert.runModal(); completionHandler()
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert(); alert.messageText = message
        alert.addButton(withTitle: "OK"); alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        let alert = NSAlert(); alert.messageText = prompt
        alert.addButton(withTitle: "OK"); alert.addButton(withTitle: "Cancel")
        let input = NSTextField(string: defaultText ?? "")
        input.frame = NSRect(x: 0, y: 0, width: 300, height: 24)
        alert.accessoryView = input
        alert.window.initialFirstResponder = input
        completionHandler(alert.runModal() == .alertFirstButtonReturn ? input.stringValue : nil)
    }
    private func showError(_ message: String, detail: String) {
        if smokeTest { fputs("\(message) \(detail)\n", stderr); exit(1) }
        let alert = NSAlert(); alert.messageText = message; alert.informativeText = detail; alert.runModal()
    }
}
