import AppKit
import WebKit

/// Hosted-runner UI checks use a nonpersistent data store and disabled fetch.
/// They do not unlock the real gate, access camera/mic, or mutate live data.
enum NativeSmokeTests {
    @MainActor static func run(window: NSWindow, workspace: WorkspaceController) {
        Task { @MainActor in
            do {
                func check(_ condition: Bool, _ label: String) throws {
                    if !condition { throw NSError(domain: "NativeSmokeTests", code: 1,
                                                  userInfo: [NSLocalizedDescriptionKey: label]) }
                    print("PASS: \(label)")
                }
                let web = workspace.webView!
                let output = FileManager.default.temporaryDirectory.appendingPathComponent("AmbassadorNativeSmoke-" + UUID().uuidString)
                try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
                print("SMOKE_OUTPUT_DIRECTORY=" + output.path)
                func js(_ source: String) async throws -> Any? {
                    try await web.evaluateJavaScript(source)
                }
                func settle() async throws { try await Task.sleep(nanoseconds: 250_000_000) }
                func snapshot() async throws -> NSImage {
                    try await withCheckedThrowingContinuation { continuation in
                        web.takeSnapshot(with: nil) { image, error in
                            if let error = error { continuation.resume(throwing: error) }
                            else if let image = image { continuation.resume(returning: image) }
                            else { continuation.resume(throwing: NSError(domain: "NativeSmokeTests", code: 2,
                                userInfo: [NSLocalizedDescriptionKey: "WebKit returned no snapshot"])) }
                        }
                    }
                }
                try await settle()
                try check(window.styleMask.contains(.resizable), "native window is resizable")
                try check(workspace.splitViewItems.count == 2, "native sidebar and detail split view")
                try check((try await js("window.K2C_DESKTOP===true && isLocalDev()===false")) as? Bool == true,
                          "packaged origin never seeds fabricated demo content")
                try check((try await js("typeof window.K2CMac.navigate==='function'")) as? Bool == true,
                          "shared feature views and desktop bridge loaded")
                let bundledJSON = try await web.callAsyncJavaScript(
                    "const response=await fetch('data/scripts.json');const data=await response.json();return {ok:response.ok,status:response.status,hasData:!!data};",
                    arguments: [:], in: nil, contentWorld: .page) as? [String: Any] ?? [:]
                try check(bundledJSON["ok"] as? Bool == true && bundledJSON["status"] as? Int == 200
                          && bundledJSON["hasData"] as? Bool == true,
                          "bundled JSON fetch returns HTTP success and valid scripts")
                let savedIcon = output.appendingPathComponent("saved-bundled-icon.png")
                try workspace.saveBundledResource(WorkspacePolicy.appURL.deletingLastPathComponent()
                    .appendingPathComponent("icon-192.png"), to: savedIcon)
                try check(try Data(contentsOf: savedIcon) == Data(contentsOf:
                    Bundle.main.resourceURL!.appendingPathComponent("www/icon-192.png")),
                    "bundled graphics save without unsupported custom-scheme WKDownload")
                _ = try await js("LIVE=true;STATE.dayPinSet=true;maybeDayGate();true")
                try check((try await js("document.getElementById('dayGate').classList.contains('show')")) as? Bool == true,
                          "configured Day PIN gate remains enforced")
                try check((try await js("appShareUrl()==='https://ambassadorcompanion.netlify.app/'")) as? Bool == true,
                          "sharing uses public app URL, never a local bundle URL")
                try check((try await js("!!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia==='function'")) as? Bool == true,
                          "bundled WebKit origin exposes media API without requesting permission")
                // Hide the test-only gate after verifying it, without storing a
                // PIN or invoking any write. This isolated data store is discarded.
                _ = try await js("LIVE=false;STATE.dayPinSet=false;maybeDayGate();true")
                let sizes: [(CGFloat, CGFloat)] = [(800, 600), (1024, 768), (1440, 900)]
                let pages = ["now", "crew", "guides", "inventory", "techio", "playbook"]
                for (width, height) in sizes {
                    window.setContentSize(NSSize(width: width, height: height))
                    window.contentView?.layoutSubtreeIfNeeded()
                    try await settle()
                    for page in pages {
                        workspace.navigate(page)
                        try await settle()
                        let metrics = try await js("(function(){var m=document.querySelector('main');var t=document.querySelector('.tabbar');return {page:pageId(),width:innerWidth,main:m.clientWidth,overflow:m.scrollWidth-m.clientWidth,tabs:getComputedStyle(t).display};})()") as? [String: Any] ?? [:]
                        try check(metrics["page"] as? String == page, "\(Int(width))px: navigate to \(page)")
                        try check(metrics["tabs"] as? String == "none", "\(Int(width))px: no duplicate phone tab bar")
                        let paneWidth = (metrics["width"] as? NSNumber)?.doubleValue ?? 0
                        let mainWidth = (metrics["main"] as? NSNumber)?.doubleValue ?? 0
                        try check(paneWidth > 0 && mainWidth >= paneWidth - 2, "\(Int(width))px: \(page) fills detail pane")
                        try check(((metrics["overflow"] as? NSNumber)?.doubleValue ?? 999) <= 2,
                                  "\(Int(width))px: \(page) has no clipped horizontal overflow")
                    }
                    workspace.navigate("now")
                    try await settle()
                    do {
                        let image = try await snapshot()
                        if let tiff = image.tiffRepresentation,
                           let bitmap = NSBitmapImageRep(data: tiff),
                           let png = bitmap.representation(using: .png, properties: [:]) {
                            try png.write(to: output.appendingPathComponent("workspace-\(Int(width))x\(Int(height)).png"))
                        }
                    }
                }
                workspace.navigate("crew"); try await settle()
                workspace.navigate("guides"); try await settle()
                workspace.goBack(nil); try await settle()
                try check((try await js("pageId()")) as? String == "crew", "native Back restores prior section")
                workspace.goForward(nil); try await settle()
                try check((try await js("pageId()")) as? String == "guides", "native Forward restores newer section")
                workspace.goBack(nil); try await settle()
                try check((try await js("pageId()")) as? String == "crew", "Back still works after Forward")
                workspace.goForward(nil); try await settle()
                let historyCount = try await js("history.length") as? Int
                workspace.navigate("guides"); workspace.navigate("guides"); try await settle()
                try check((try await js("history.length")) as? Int == historyCount,
                          "repeated sidebar selection does not duplicate history")
                workspace.splitViewItems[0].isCollapsed = true
                window.contentView?.layoutSubtreeIfNeeded(); try await settle()
                try check(workspace.splitViewItems[0].isCollapsed, "sidebar can collapse")
                workspace.splitViewItems[0].isCollapsed = false
                window.contentView?.layoutSubtreeIfNeeded(); try await settle()
                try check(!workspace.splitViewItems[0].isCollapsed, "sidebar can restore")
                workspace.zoomIn(nil)
                try check(web.pageZoom > 1, "desktop zoom works")
                workspace.actualSize(nil)
                try check(web.pageZoom == 1, "actual size restores zoom")
                print("Native macOS smoke tests passed. Camera/mic hardware, save/print dialogs and signing still need release QA.")
                exit(0)
            } catch { fputs("FAIL: \(error.localizedDescription)\n", stderr); exit(1) }
        }
    }
}
