import XCTest
@testable import BalanceCore

final class DayLayoutTests: XCTestCase {
    var calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Amsterdam")!
        return c
    }()

    func at(_ d: Int, _ h: Int, _ m: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 10, day: d, hour: h, minute: m))!
    }

    func layout(_ items: [(String, Date, Date)], day: Int = 1) -> [String: DayLayout.Item] {
        let inputs = items.map { DayLayout.Input(id: $0.0, start: $0.1, end: $0.2) }
        return Dictionary(uniqueKeysWithValues: DayLayout.layout(inputs, day: at(day, 0), calendar: calendar).map { ($0.id, $0) })
    }

    func testSeparateBlocksAreFullWidth() {
        let r = layout([("a", at(1, 9), at(1, 10)), ("b", at(1, 10), at(1, 11))])
        XCTAssertEqual(r["a"]?.lanes, 1)
        XCTAssertEqual(r["b"]?.lanes, 1)
        XCTAssertEqual(r["a"]?.startMinute, 540)
    }

    func testOverlapSplits() {
        let r = layout([("a", at(1, 9), at(1, 11)), ("b", at(1, 10), at(1, 12))])
        XCTAssertEqual(r["a"]?.lanes, 2)
        XCTAssertEqual(r["a"]?.lane, 0)
        XCTAssertEqual(r["b"]?.lane, 1)
    }

    func testFreedLaneIsReused() {
        let r = layout([("a", at(1, 9), at(1, 12)), ("b", at(1, 9), at(1, 10)), ("c", at(1, 10, 30), at(1, 11))])
        XCTAssertEqual(r["c"]?.lane, 1)
        XCTAssertEqual(r["c"]?.lanes, 2)
    }

    func testWidensOverUnusedLanes() {
        // a and b overlap and c overlaps a only, so a three-lane cluster lets `c`... stay in lane 1,
        // while `d`, which overlaps only `a`, spans the two lanes to its right.
        let r = layout([
            ("a", at(1, 9), at(1, 13)),
            ("b", at(1, 9), at(1, 10)),
            ("c", at(1, 9), at(1, 10)),
            ("d", at(1, 11), at(1, 12)),
        ])
        XCTAssertEqual(r["a"]?.lanes, 3)
        XCTAssertEqual(r["d"]?.lane, 1)
        XCTAssertEqual(r["d"]?.span, 2)
        XCTAssertEqual(r["b"]?.span, 1)
    }

    func testClipsToTheDay() {
        let r = layout([("night", at(1, 22), at(2, 7))], day: 2)
        XCTAssertEqual(r["night"]?.startMinute, 0)
        XCTAssertEqual(r["night"]?.endMinute, 420)
        XCTAssertNil(layout([("other", at(3, 9), at(3, 10))])["other"])
    }

    func testShortBlocksAreStillPressable() {
        let r = layout([("a", at(1, 9), at(1, 9, 5))])
        XCTAssertEqual(r["a"]!.endMinute - r["a"]!.startMinute, DayLayout.minimumMinutes)
    }

    func testBlockAtMidnightEndStaysInside() {
        let r = layout([("a", at(1, 23, 55), at(2, 0))])
        XCTAssertEqual(r["a"]?.endMinute, 1440)
        XCTAssertEqual(r["a"]?.startMinute, 1425)
    }

    /// The day the clocks go back is 25 hours long; the last hour must still be inside it.
    func testDSTDayIsLonger() {
        let r = layout([("late", at(25, 23), at(25, 23, 30))], day: 25)
        XCTAssertEqual(r["late"]?.startMinute, 24 * 60)
    }
}
