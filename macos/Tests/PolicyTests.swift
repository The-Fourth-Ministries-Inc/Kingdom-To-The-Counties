import Foundation

@main struct PolicyTests {
    static func main() throws {
        func check(_ condition: Bool, _ label: String) {
            guard condition else { fatalError(label) }
            print("PASS: \(label)")
        }
        let root = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("macos-policy-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        check(WorkspacePolicy.isBundled(WorkspacePolicy.appURL), "bundle origin allowed")
        for value in ["capacitor://evil/index.html", "https://localhost/index.html", "file:///etc/passwd",
                      "capacitor://user@localhost/index.html", "capacitor://localhost:80/index.html"] {
            check(!WorkspacePolicy.isBundled(URL(string: value)!), "untrusted origin rejected: \(value)")
        }
        check(WorkspacePolicy.resourceURL(for: URL(string: "capacitor://localhost/")!, root: root)?.lastPathComponent == "index.html", "root loads index")
        check(WorkspacePolicy.resourceURL(for: URL(string: "capacitor://localhost/assets/icon.png")!, root: root)?.path == root.path + "/assets/icon.png", "assets stay in bundle")
        check(WorkspacePolicy.resourceURL(for: URL(string: "capacitor://localhost/../../secret")!, root: root) == nil, "path traversal rejected")
        check(WorkspacePolicy.resourceURL(for: URL(string: "capacitor://localhost/%2e%2e/secret")!, root: root) == nil, "encoded traversal rejected")
        let link = root.appendingPathComponent("escape")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: root.deletingLastPathComponent())
        check(WorkspacePolicy.resourceURL(for: URL(string: "capacitor://localhost/escape/secret")!, root: root) == nil, "symlink escape rejected")
        for value in ["javascript:alert(1)", "file:///tmp/file", "http://example.com", "custom://launch"] {
            check(!WorkspacePolicy.canOpenExternally(URL(string: value)!), "unsafe external scheme rejected")
        }
        for value in ["https://example.com/path", "mailto:info@example.com", "tel:+15551234567", "sms:+15551234567"] {
            check(WorkspacePolicy.canOpenExternally(URL(string: value)!), "expected external scheme allowed")
        }
        let quoted = "\";alert('x');//\n"
        let data = Data(("[" + WorkspacePolicy.scriptString(quoted) + "]").utf8)
        check((try JSONSerialization.jsonObject(with: data) as? [String]) == [quoted], "bridge arguments are JSON escaped")
        check(Set(WorkspaceDestination.all.map { $0.id }).count == WorkspaceDestination.all.count, "destinations are unique")
    }
}
