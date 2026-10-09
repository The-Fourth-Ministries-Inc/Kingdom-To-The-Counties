import Foundation
import WebKit
import UniformTypeIdentifiers

final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    private let root: URL
    init(root: URL) { self.root = root }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url,
              let file = WorkspacePolicy.resourceURL(for: url, root: root),
              let data = try? Data(contentsOf: file) else {
            urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let knownTypes = ["js": "text/javascript", "mjs": "text/javascript",
                          "css": "text/css", "json": "application/json",
                          "svg": "image/svg+xml", "woff2": "font/woff2"]
        let mime = knownTypes[file.pathExtension]
            ?? UTType(filenameExtension: file.pathExtension)?.preferredMIMEType
            ?? "application/octet-stream"
        // A plain URLResponse produces fetch status 0 in WebKit. Bundled
        // JSON loaders intentionally require response.ok, just like HTTPS.
        let contentType = mime.hasPrefix("text/") ? mime + "; charset=utf-8" : mime
        guard let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": contentType, "Content-Length": String(data.count)]) else {
            urlSchemeTask.didFailWithError(URLError(.badServerResponse))
            return
        }
        // All callbacks are synchronous on WebKit's requested thread, so stop
        // can never race an asynchronous read or deliver to a cancelled task.
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}
