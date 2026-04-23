// Septena calendar helper — prints upcoming events as JSON on stdout.
//
// Reads EKEvents across all calendars for a configurable window (default 7 days)
// and emits a JSON array: [{title, start, end, calendar, all_day, location}, ...].
// On first run, macOS prompts for Calendar access via the embedded Info.plist
// (NSCalendarsFullAccessUsageDescription). The grant persists in TCC.
//
// Build: see build.sh in this directory.

import EventKit
import Foundation

let store = EKEventStore()

func requestAccess() -> Bool {
    var granted = false
    let sem = DispatchSemaphore(value: 0)

    if #available(macOS 14.0, *) {
        store.requestFullAccessToEvents { ok, _ in
            granted = ok
            sem.signal()
        }
    } else {
        store.requestAccess(to: .event) { ok, _ in
            granted = ok
            sem.signal()
        }
    }
    _ = sem.wait(timeout: .now() + 30)
    return granted
}

let days: Double = {
    if let raw = ProcessInfo.processInfo.environment["SEPTENA_CAL_DAYS"],
       let n = Double(raw), n > 0 { return n }
    return 7
}()

guard requestAccess() else {
    FileHandle.standardError.write(Data("calendar access denied\n".utf8))
    exit(2)
}

let start = Date()
let end = Date(timeIntervalSinceNow: days * 86400)
let predicate = store.predicateForEvents(withStart: start, end: end, calendars: nil)
let events = store.events(matching: predicate)

let iso = ISO8601DateFormatter()
iso.formatOptions = [.withInternetDateTime]

let payload: [[String: Any]] = events.map { ev in
    [
        "title": ev.title ?? "(no title)",
        "start": iso.string(from: ev.startDate),
        "end": iso.string(from: ev.endDate),
        "calendar": ev.calendar?.title ?? "",
        "all_day": ev.isAllDay,
        "location": ev.location ?? "",
    ]
}

let data = try JSONSerialization.data(withJSONObject: payload, options: [])
FileHandle.standardOutput.write(data)
