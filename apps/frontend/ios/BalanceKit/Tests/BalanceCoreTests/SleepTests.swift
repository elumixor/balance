import XCTest
@testable import BalanceCore

/// The same cases as `integrations/sleep-*.test.ts`, so the phone and the web read a night alike.
final class SleepTests: XCTestCase {
    /// Minutes past 22:00 UTC on one evening.
    func at(_ minutes: Int) -> Date {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c.date(from: DateComponents(year: 2026, month: 9, day: 3, hour: 22))!.addingTimeInterval(Double(minutes) * 60)
    }

    func sample(_ from: Int, _ to: Int, _ stage: Sleep.Stage = .core) -> Sleep.Sample {
        Sleep.Sample(start: at(from), end: at(to), stage: stage)
    }

    var block: (start: Date, end: Date) { (at(60), at(540)) }

    func testNothingRecorded() {
        XCTAssertNil(Sleep.summary([], block: block))
    }

    func testWatchStagesAndAwakenings() {
        let s = Sleep.summary([sample(41, 100, .core), sample(100, 160, .deep), sample(160, 170, .awake), sample(170, 250, .rem), sample(250, 552, .core)], block: block)!
        XCTAssertEqual(s.start, at(41))
        XCTAssertEqual(s.end, at(552))
        XCTAssertEqual(s.asleepMinutes, 59 + 60 + 80 + 302)
        XCTAssertEqual(s.stages, [.core: 361, .deep: 60, .awake: 10, .rem: 80])
        XCTAssertEqual(s.awakenings, 1)
        XCTAssertTrue(s.staged)
    }

    func testPhoneAloneKnowsInBed() {
        let s = Sleep.summary([sample(30, 510, .inBed), sample(200, 220, .awake)], block: block)!
        XCTAssertEqual(s.asleepMinutes, 460)
        XCTAssertFalse(s.staged)
        XCTAssertEqual(s.stages, [.inBed: 480, .awake: 20])
        XCTAssertEqual(Sleep.summary([sample(30, 510, .inBed)], block: block)?.asleepMinutes, 480)
    }

    func testInBedIsSilentOnceStagesExist() {
        let s = Sleep.summary([sample(30, 510, .inBed), sample(40, 500, .core)], block: block)!
        XCTAssertEqual(s.stages, [.core: 460])
        XCTAssertEqual(s.asleepMinutes, 460)
    }

    func testPicksTheBlocksNightNotTheNap() {
        XCTAssertEqual(Sleep.summary([sample(-540, -480), sample(50, 500)], block: block)?.start, at(50))
    }

    func testNightOutOfReach() {
        let slack = Int(Sleep.windowSlack / 60)
        XCTAssertNil(Sleep.summary([sample(540 + slack + 1, 540 + slack + 60)], block: block))
    }

    func testGapsJoinAndGlitchesDrop() {
        XCTAssertEqual(Sleep.sessions([sample(0, 100), sample(180, 300)]).count, 1)
        XCTAssertEqual(Sleep.sessions([sample(0, 100), sample(191, 300)]).count, 2)
        XCTAssertEqual(Sleep.sessions([sample(0, 19)]).count, 0)
    }

    // MARK: Score

    func night(start: Int = 60, asleep: Int = 470, stages: [Sleep.Stage: Int] = [.deep: 60, .rem: 90, .core: 320], awakenings: Int = 0, staged: Bool = true) -> Sleep.Summary {
        Sleep.Summary(start: at(start), end: at(540), asleepMinutes: asleep, stages: stages, awakenings: awakenings, staged: staged)
    }

    func score(_ n: Sleep.Summary) -> Sleep.Score { Sleep.score(n, plannedStart: at(60)) }

    func testFullNightIs100() {
        XCTAssertEqual(score(night()), Sleep.Score(total: 100, duration: 50, bedtime: 30, interruptions: 20))
        XCTAssertEqual(score(night()).band, "Very high")
    }

    func testShortNights() {
        let stages: [Sleep.Stage: Int] = [.deep: 100, .rem: 100, .core: 200]
        XCTAssertEqual(score(night(asleep: 410, stages: stages)).duration, 45)
        XCTAssertEqual(score(night(asleep: 350, stages: stages)).duration, 37)
        XCTAssertEqual(score(night(asleep: 230, stages: stages)).duration, 0)
        XCTAssertEqual(score(night(asleep: 440, stages: [.deep: 100, .rem: 100, .core: 240])).duration, 48)
    }

    func testThinStages() {
        XCTAssertEqual(score(night(stages: [.deep: 10, .rem: 20, .core: 440])).duration, 40)
        XCTAssertEqual(score(night(stages: [.deep: 10, .rem: 90, .core: 370])).duration, 45)
        XCTAssertEqual(score(night(stages: [.inBed: 480], staged: false)).duration, 50)
        XCTAssertEqual(score(night(stages: [.core: 470])).duration, 40)
    }

    func testBedtime() {
        XCTAssertEqual(score(night(start: 74)).bedtime, 30)
        XCTAssertEqual(score(night(start: 120)).bedtime, 20)
        XCTAssertEqual(score(night(start: 210)).bedtime, 0)
    }

    func testRecordCarriesThePlanForward() {
        let summary = night()
        let first = Sleep.record(summary, block: (at(60), at(540)), previous: nil)
        XCTAssertEqual(first["plannedStart"] as? String, "2026-09-03T23:00:00.000Z")
        let later = Sleep.record(summary, block: (at(41), at(552)), previous: first)
        XCTAssertEqual(later["plannedStart"] as? String, "2026-09-03T23:00:00.000Z")
        XCTAssertEqual((later["score"] as? [String: Any])?["total"] as? Int, 100)
    }
}
