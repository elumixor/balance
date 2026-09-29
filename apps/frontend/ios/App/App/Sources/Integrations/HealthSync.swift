import BalanceCore
import BalanceKit
import Foundation
import HealthKit

/// Apple Health's sleep, hung off the calendar blocks that planned it.
///
/// A "Sleep" block linked to the feed (`source` on its mapping, set from the event's card) is
/// looked up night by night: the samples around each past occurrence make the night
/// (`Sleep.summary`), the record is written to the server for every platform's card to draw, and
/// the block is moved to when the night actually was — once, since the next read finds it there.
/// Only a phone can read Health, and only once the person has let it, which is kept here.
@MainActor
@Observable
final class HealthSync {
    static let shared = HealthSync()
    static let feed = "apple-health:sleep"

    private let store = HKHealthStore()
    private let sleepType = HKCategoryType(.sleepAnalysis)
    /// A launch or a return syncs at most this often; the button in Settings always does.
    private static let every: TimeInterval = 4 * 3600
    private static let lookback: TimeInterval = 14 * 86400

    private(set) var syncing = false
    private(set) var lastError: String?

    var available: Bool { HKHealthStore.isHealthDataAvailable() }

    var connected: Bool {
        get { UserDefaults.standard.bool(forKey: "health.connected") }
        set { UserDefaults.standard.set(newValue, forKey: "health.connected") }
    }

    private var syncedAt: Date? {
        get { UserDefaults.standard.object(forKey: "health.syncedAt") as? Date }
        set { UserDefaults.standard.set(newValue, forKey: "health.syncedAt") }
    }

    /// Puts up the system sheet. Apple keeps read permission secret, so this only knows it was
    /// answered — a refusal looks like a store with no nights in it.
    func connect() async -> Bool {
        guard available else { return false }
        do {
            try await store.requestAuthorization(toShare: [], read: [sleepType])
            connected = true
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    func disconnect() { connected = false }

    func syncIfDue(_ app: Store) async {
        guard connected, available else { return }
        if let syncedAt, Date().timeIntervalSince(syncedAt) < Self.every { return }
        await sync(app)
    }

    func sync(_ app: Store) async {
        guard available, !syncing else { return }
        if !connected, !(await connect()) { return }
        syncing = true
        defer { syncing = false }
        do {
            let now = Date()
            let page = try await app.backend.events(from: now.addingTimeInterval(-Self.lookback), to: now)
            let linked = page.events.filter { $0.source == Self.feed && $0.end <= now }.suffix(60)
            var records: [(calendarId: String, eventId: String, data: JSON)] = []
            for event in linked {
                let window = (start: event.start, end: event.end)
                let samples = try await samples(from: event.start.addingTimeInterval(-Sleep.windowSlack), to: event.end.addingTimeInterval(Sleep.windowSlack))
                guard let summary = Sleep.summary(samples, block: window) else { continue }
                let previous = event.record?.any as? [String: Any]
                let record = Sleep.record(summary, block: window, previous: previous)
                records.append((event.calendarId, event.id, JSON.from(any: record)))
                // The block goes where the night was, once; within a minute is where it already is.
                if event.movable, abs(summary.start.timeIntervalSince(event.start)) >= 60 || abs(summary.end.timeIntervalSince(event.end)) >= 60 {
                    _ = try await app.backend.patchEvent(id: event.id, [
                        "calendarId": .string(event.calendarId),
                        "start": .string(ISO8601.string(from: summary.start)), "end": .string(ISO8601.string(from: summary.end)),
                    ])
                }
            }
            if !records.isEmpty {
                try await app.backend.saveRecords(source: Self.feed, records: records)
                await app.ensureWeeks(around: now, force: true)
            }
            syncedAt = Date()
            lastError = nil
        } catch {
            lastError = error.localizedDescription
            app.report(error, "Couldn't read your sleep")
        }
    }

    private func samples(from: Date, to: Date) async throws -> [Sleep.Sample] {
        try await withCheckedThrowingContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: from, end: to, options: [])
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
            let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, results, error in
                if let error { return continuation.resume(throwing: error) }
                let samples = (results as? [HKCategorySample] ?? []).compactMap { sample -> Sleep.Sample? in
                    guard let stage = Self.stage(sample.value) else { return nil }
                    return Sleep.Sample(start: sample.startDate, end: sample.endDate, stage: stage)
                }
                continuation.resume(returning: samples)
            }
            store.execute(query)
        }
    }

    /// Health's stages by the names the records use. A stage newer than this build is dropped
    /// rather than guessed at.
    nonisolated private static func stage(_ value: Int) -> Sleep.Stage? {
        switch HKCategoryValueSleepAnalysis(rawValue: value) {
        case .inBed: return .inBed
        case .awake: return .awake
        case .asleepUnspecified: return .asleep
        case .asleepCore: return .core
        case .asleepDeep: return .deep
        case .asleepREM: return .rem
        default: return nil
        }
    }
}
