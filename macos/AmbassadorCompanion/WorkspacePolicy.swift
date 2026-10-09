import Foundation

/// One stable, bundled origin preserves the existing mobile CORS boundary and
/// WebKit's persistent local storage. External sites never run in this web view.
enum WorkspacePolicy {
    static let appURL = URL(string: "capacitor://localhost/index.html")!
    static let publicURL = URL(string: "https://ambassadorcompanion.netlify.app")!
    static let scheme = "capacitor"

    static func isBundled(_ url: URL) -> Bool {
        url.scheme == scheme && url.host == "localhost" && url.port == nil
            && url.user == nil && url.password == nil
    }

    static func canOpenExternally(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return false }
        return ["https", "mailto", "tel", "sms"].contains(scheme)
    }

    static func resourceURL(for url: URL, root: URL) -> URL? {
        guard isBundled(url) else { return nil }
        let path = url.path.isEmpty || url.path == "/" ? "index.html" : url.path
        let base = root.resolvingSymlinksInPath().standardizedFileURL
        let candidate = base.appendingPathComponent(path)
            .resolvingSymlinksInPath().standardizedFileURL
        guard candidate.path.hasPrefix(base.path + "/") else { return nil }
        return candidate
    }

    static func scriptString(_ value: String) -> String {
        let data = try! JSONSerialization.data(withJSONObject: [value])
        return String(data: data, encoding: .utf8)!.dropFirst().dropLast().description
    }
}

struct WorkspaceDestination {
    let id: String
    let title: String
    let symbol: String

    static let all: [WorkspaceDestination] = [
        .init(id: "now", title: "Event Day", symbol: "clock"),
        .init(id: "mobilize", title: "Pre-Crusade", symbol: "building.2"),
        .init(id: "crew", title: "Specialists", symbol: "person.2"),
        .init(id: "board", title: "Post", symbol: "bubble.left.and.bubble.right"),
        .init(id: "guides", title: "Resources", symbol: "books.vertical"),
        .init(id: "inventory", title: "Trailer Load List", symbol: "shippingbox"),
        .init(id: "techio", title: "Tech I/O", symbol: "slider.horizontal.3"),
        .init(id: "capture", title: "Quick Capture", symbol: "person.crop.rectangle.badge.plus"),
        .init(id: "playbook", title: "Field Playbook", symbol: "book.closed"),
        .init(id: "handbook", title: "Counselor Booklet", symbol: "heart.text.square")
    ]
}
