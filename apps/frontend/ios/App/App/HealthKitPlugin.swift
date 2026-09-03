import Capacitor
import Foundation
import HealthKit

/// The phone half of the Apple Health integration: permission, and sleep samples as recorded.
///
/// Health data never leaves the device except through an app the person has let read it, and only
/// native code can ask. So this is deliberately thin — it puts up the permission sheet and hands
/// raw samples up — and decides nothing: what a night is, and what it counts as, is worked out in
/// the webview (`integrations/sleep-sessions.ts`), where the rest of the calendar's rules live.
///
/// Apple keeps *read* permission secret from the app asking — a refusal is indistinguishable from
/// a store with nothing in it — so `authorize` resolves once the sheet is answered, not with the
/// answer, and an empty result is reported as exactly that.
@objc(HealthKitPlugin)
public class HealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthKitPlugin"
    public let jsName = "HealthKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sleepSamples", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()
    private let sleepType = HKCategoryType(.sleepAnalysis)
    private let iso: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    @objc func available(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func authorize(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            return call.reject("Health data isn't available on this device")
        }
        store.requestAuthorization(toShare: [], read: [sleepType]) { _, error in
            if let error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }

    /// Every sleep sample in the window, from every source, as Health holds it. Overlaps between a
    /// watch and a phone that both recorded the same night are left for the webview to merge.
    @objc func sleepSamples(_ call: CAPPluginCall) {
        guard let from = call.getString("from").flatMap(parse), let to = call.getString("to").flatMap(parse) else {
            return call.reject("from and to must be ISO 8601 instants")
        }
        let predicate = HKQuery.predicateForSamples(withStart: from, end: to, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { [iso] _, results, error in
            if let error { return call.reject(error.localizedDescription) }
            let samples = (results as? [HKCategorySample] ?? []).compactMap { sample -> [String: String]? in
                guard let stage = Self.stage(of: sample.value) else { return nil }
                return ["start": iso.string(from: sample.startDate), "end": iso.string(from: sample.endDate), "stage": stage]
            }
            call.resolve(["samples": samples])
        }
        store.execute(query)
    }

    /// A raw ISO string may or may not carry fractional seconds; both are accepted.
    private func parse(_ value: String) -> Date? {
        iso.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    /// The webview's names for Health's stages. Anything newer than this build knows is dropped
    /// rather than guessed at — an unknown value is not a kind of sleep.
    private static func stage(of value: Int) -> String? {
        switch HKCategoryValueSleepAnalysis(rawValue: value) {
        case .inBed: return "inBed"
        case .awake: return "awake"
        case .asleepUnspecified: return "asleep"
        case .asleepCore: return "core"
        case .asleepDeep: return "deep"
        case .asleepREM: return "rem"
        default: return nil
        }
    }
}
