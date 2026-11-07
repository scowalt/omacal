// Drives one process's UI through the macOS Accessibility API. The WKWebView
// inside OmaCal exposes the DOM as an AX tree: ARIA labels arrive as
// AXDescription, text as AXValue/AXTitle, and `id` attributes as
// AXDOMIdentifier. Compiled once by `omacal-verify` (swiftc), never run by hand.
//
//   ax dump  PID [--depth N]          the window's tree, one element per line
//   ax find  PID LABEL [--contains]   print matching elements, exit 1 if none
//   ax press PID LABEL [--contains]   AXPress the first match
//   ax wait  PID LABEL [--contains] [--timeout S]
//   ax type  PID TEXT                 keystrokes into the focused element
//   ax key   PID KEY [--cmd] [--shift] [--alt] [--ctrl]   one key (name or char)
//   ax focus PID LABEL [--contains]   set AXFocused on the first match
//   ax fill  PID LABEL TEXT [--role R]  focus, select all, delete, type TEXT;
//                                       exit 1 unless the field then holds TEXT
//   ax winid PID                      the window number, for screencapture -l
//
// A LABEL matches AXDescription, AXTitle, AXValue (strings only) or
// AXDOMIdentifier, exactly unless --contains. --role AXTextField (or any
// role) narrows find/press/focus/wait, because a field's visible label is
// often an AXStaticText with the same text, earlier in the tree.

import ApplicationServices
import Foundation

func fail(_ msg: String, _ code: Int32 = 2) -> Never {
    FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
    exit(code)
}

func attr(_ el: AXUIElement, _ name: String) -> AnyObject? {
    var v: AnyObject?
    return AXUIElementCopyAttributeValue(el, name as CFString, &v) == .success ? v : nil
}

func str(_ el: AXUIElement, _ name: String) -> String? {
    guard let v = attr(el, name) else { return nil }
    if let s = v as? String { return s.isEmpty ? nil : s }
    return nil
}

func children(_ el: AXUIElement) -> [AXUIElement] {
    (attr(el, kAXChildrenAttribute) as? [AXUIElement]) ?? []
}

func frame(_ el: AXUIElement) -> String {
    var p = CGPoint.zero, s = CGSize.zero
    if let pv = attr(el, kAXPositionAttribute) { AXValueGetValue(pv as! AXValue, .cgPoint, &p) }
    if let sv = attr(el, kAXSizeAttribute) { AXValueGetValue(sv as! AXValue, .cgSize, &s) }
    return "@\(Int(p.x)),\(Int(p.y)) \(Int(s.width))x\(Int(s.height))"
}

func describe(_ el: AXUIElement) -> String {
    var parts = [str(el, kAXRoleAttribute) ?? "?"]
    if let sub = str(el, kAXSubroleAttribute) { parts[0] += "/" + sub }
    if let d = str(el, kAXDescriptionAttribute) { parts.append("desc=\(d.debugDescription)") }
    if let t = str(el, kAXTitleAttribute) { parts.append("title=\(t.debugDescription)") }
    if let v = str(el, kAXValueAttribute) { parts.append("value=\(String(v.prefix(120)).debugDescription)") }
    // Toggles and checkboxes: 1 is on.
    else if let n = attr(el, kAXValueAttribute) as? NSNumber { parts.append("value=\(n)") }
    if let i = str(el, "AXDOMIdentifier") { parts.append("id=\(i)") }
    if (attr(el, kAXFocusedAttribute) as? Bool) == true { parts.append("FOCUSED") }
    if (attr(el, kAXEnabledAttribute) as? Bool) == false { parts.append("disabled") }
    parts.append(frame(el))
    return parts.joined(separator: " ")
}

func appElement(_ pid: pid_t) -> AXUIElement {
    guard AXIsProcessTrusted() else {
        fail("this process is not trusted for Accessibility (System Settings > Privacy & Security > Accessibility)", 3)
    }
    return AXUIElementCreateApplication(pid)
}

func windows(_ app: AXUIElement) -> [AXUIElement] {
    (attr(app, kAXWindowsAttribute) as? [AXUIElement]) ?? []
}

func walk(_ el: AXUIElement, _ depth: Int, _ max: Int, _ visit: (AXUIElement, Int) -> Bool) -> Bool {
    if visit(el, depth) { return true }
    if depth >= max { return false }
    for c in children(el) where walk(c, depth + 1, max, visit) { return true }
    return false
}

var roleFilter: String?

func matches(_ el: AXUIElement, _ label: String, _ contains: Bool) -> Bool {
    if let r = roleFilter, str(el, kAXRoleAttribute) != r { return false }
    for name in [kAXDescriptionAttribute, kAXTitleAttribute, kAXValueAttribute, "AXDOMIdentifier"] {
        if let s = str(el, name), contains ? s.contains(label) : s == label { return true }
    }
    return false
}

func findAll(_ pid: pid_t, _ label: String, _ contains: Bool, limit: Int = .max) -> [AXUIElement] {
    var found: [AXUIElement] = []
    for w in windows(appElement(pid)) {
        _ = walk(w, 0, 60) { el, _ in
            if matches(el, label, contains) { found.append(el) }
            return found.count >= limit
        }
    }
    return found
}

func keyCode(_ name: String) -> (CGKeyCode, Bool)? {
    let named: [String: CGKeyCode] = [
        "return": 36, "enter": 36, "tab": 48, "space": 49, "delete": 51, "escape": 53, "esc": 53,
        "left": 123, "right": 124, "down": 125, "up": 126, "home": 115, "end": 119,
        "pageup": 116, "pagedown": 121, "forwarddelete": 117,
    ]
    if let k = named[name.lowercased()] { return (k, false) }
    // ANSI positions, so a shortcut's KeyboardEvent.code is right too.
    let ansi: [Character: CGKeyCode] = [
        "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9,
        "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17, "1": 18, "2": 19,
        "3": 20, "4": 21, "6": 22, "5": 23, "=": 24, "9": 25, "7": 26, "-": 27, "8": 28,
        "0": 29, "]": 30, "o": 31, "u": 32, "[": 33, "i": 34, "p": 35, "l": 37, "j": 38,
        "'": 39, "k": 40, ";": 41, "\\": 42, ",": 43, "/": 44, "n": 45, "m": 46, ".": 47,
    ]
    if name.count == 1, let k = ansi[Character(name.lowercased())] { return (k, true) }
    return nil
}

func post(_ pid: pid_t, _ code: CGKeyCode?, _ char: String?, flags: CGEventFlags) {
    let src = CGEventSource(stateID: .hidSystemState)
    for down in [true, false] {
        guard let e = CGEvent(keyboardEventSource: src, virtualKey: code ?? 0, keyDown: down) else { continue }
        if let ch = char {
            let u = Array(ch.utf16)
            e.keyboardSetUnicodeString(stringLength: u.count, unicodeString: u)
        }
        e.flags = flags
        e.postToPid(pid)
        usleep(8000)
    }
}

var args = Array(CommandLine.arguments.dropFirst())
func flag(_ f: String) -> Bool {
    if let i = args.firstIndex(of: f) { args.remove(at: i); return true }
    return false
}
func option(_ f: String) -> String? {
    guard let i = args.firstIndex(of: f), i + 1 < args.count else { return nil }
    let v = args[i + 1]; args.removeSubrange(i...(i + 1)); return v
}

let contains = flag("--contains")
roleFilter = option("--role")
let depth = Int(option("--depth") ?? "60") ?? 60
let timeout = Double(option("--timeout") ?? "20") ?? 20
var mods: CGEventFlags = []
if flag("--cmd") { mods.insert(.maskCommand) }
if flag("--shift") { mods.insert(.maskShift) }
if flag("--alt") { mods.insert(.maskAlternate) }
if flag("--ctrl") { mods.insert(.maskControl) }
guard args.count >= 2, let pid = pid_t(args[1]) else {
    fail("usage: ax dump|find|press|wait|type|key|focus PID [ARG] [flags]")
}
let cmd = args[0]
let arg = args.count > 2 ? args[2] : ""

switch cmd {
case "dump":
    let ws = windows(appElement(pid))
    if ws.isEmpty { fail("no windows for pid \(pid)", 1) }
    for w in ws {
        _ = walk(w, 0, depth) { el, d in
            print(String(repeating: "  ", count: d) + describe(el)); return false
        }
    }
case "find":
    let hits = findAll(pid, arg, contains)
    hits.forEach { print(describe($0)) }
    exit(hits.isEmpty ? 1 : 0)
case "press":
    guard let el = findAll(pid, arg, contains, limit: 1).first else { fail("no element matches \(arg.debugDescription)", 1) }
    let what = describe(el)
    let r = AXUIElementPerformAction(el, kAXPressAction as CFString)
    if r != .success { fail("AXPress failed (\(r.rawValue)) on \(what)", 1) }
    print("pressed " + what)
case "focus":
    guard let el = findAll(pid, arg, contains, limit: 1).first else { fail("no element matches \(arg.debugDescription)", 1) }
    let r = AXUIElementSetAttributeValue(el, kAXFocusedAttribute as CFString, kCFBooleanTrue)
    if r != .success { fail("focus failed (\(r.rawValue)) on \(describe(el))", 1) }
    print("focused " + describe(el))
case "fill":
    guard args.count > 3 else { fail("usage: ax fill PID LABEL TEXT") }
    guard let el = findAll(pid, arg, contains, limit: 1).first else { fail("no element matches \(arg.debugDescription)", 1) }
    // Keystrokes into anything but a focused field are app shortcuts (n
    // opens a new event), so refuse before typing a single one.
    let editable: Set<String> = [kAXTextFieldRole, kAXTextAreaRole, kAXComboBoxRole]
    guard editable.contains(str(el, kAXRoleAttribute) ?? "") else { fail("not a text field: " + describe(el), 1) }
    AXUIElementSetAttributeValue(el, kAXFocusedAttribute as CFString, kCFBooleanTrue)
    usleep(50_000)
    guard (attr(el, kAXFocusedAttribute) as? Bool) == true else { fail("could not focus: " + describe(el), 1) }
    // Select everything through AX: Cmd+A is a menu command, and OmaCal's
    // menu bar has no Edit menu to carry it.
    let len = (str(el, kAXValueAttribute) ?? "").utf16.count
    var range = CFRange(location: 0, length: len)
    if len > 0, let v = AXValueCreate(.cfRange, &range) {
        AXUIElementSetAttributeValue(el, kAXSelectedTextRangeAttribute as CFString, v)
        post(pid, 51, nil, flags: [])
    }
    for ch in args[3] { post(pid, nil, String(ch), flags: []) }
    usleep(150_000)
    // A fill that did not land (focus stolen, wrong element) must not look
    // like one that did.
    if (str(el, kAXValueAttribute) ?? "") != args[3] { fail("fill did not take: " + describe(el), 1) }
    print("filled " + describe(el))
case "wait":
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
        if let el = findAll(pid, arg, contains, limit: 1).first { print(describe(el)); exit(0) }
        usleep(250_000)
    }
    fail("timed out after \(timeout)s waiting for \(arg.debugDescription)", 1)
case "type":
    for ch in arg { post(pid, nil, String(ch), flags: []) }
case "key":
    if let (code, printable) = keyCode(arg) { post(pid, code, printable ? arg : nil, flags: mods) }
    else if arg.count == 1 { post(pid, nil, arg, flags: mods) }
    else { fail("unknown key \(arg.debugDescription)") }
case "winid":
    let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
    guard let w = info.first(where: { ($0[kCGWindowOwnerPID as String] as? pid_t) == pid
                                      && ($0[kCGWindowLayer as String] as? Int) == 0 }),
          let n = w[kCGWindowNumber as String] as? Int else { fail("no on-screen window for pid \(pid)", 1) }
    print(n)
default:
    fail("unknown command \(cmd)")
}
