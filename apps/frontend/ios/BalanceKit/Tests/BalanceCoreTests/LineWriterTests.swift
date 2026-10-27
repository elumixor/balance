import XCTest
@testable import BalanceCore

final class LineWriterTests: XCTestCase {
    var calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Amsterdam")!
        return c
    }()

    lazy var now = date(2026, 9, 30, 10, 0)

    func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0, _ min: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: min))!
    }

    let vocabulary = Vocabulary(spheres: [.init(id: "work", name: "Deep work")])

    func testTodayIsLeftOutOfATimedLine() {
        let text = LineWriter.event(title: "Standup", start: date(2026, 9, 30, 9, 30), end: date(2026, 9, 30, 10), allDay: false, now: now, calendar: calendar)
        XCTAssertEqual(text, "Standup 9:30-10:00")
    }

    func testTwelveHourClock() {
        let text = LineWriter.event(title: "Gym", start: date(2026, 10, 1, 7), end: date(2026, 10, 1, 7, 45), allDay: false, now: now, calendar: calendar, uses24h: false)
        XCTAssertEqual(text, "Gym tomorrow 7am-7:45am")
    }

    func testDaysAreRelative() {
        func day(_ d: Date) -> String { LineWriter.dayWord(d, now: now, calendar: calendar, force: true) }
        XCTAssertEqual(day(date(2026, 9, 30)), "today")
        XCTAssertEqual(day(date(2026, 10, 1)), "tomorrow")
        XCTAssertEqual(day(date(2026, 9, 29)), "yesterday")
        XCTAssertEqual(day(date(2026, 10, 2)), "friday")
        XCTAssertEqual(day(date(2026, 10, 6)), "tuesday")
        XCTAssertEqual(day(date(2026, 10, 7)), "7.10")
        XCTAssertEqual(day(date(2027, 1, 7)), "7.1.2027")
    }

    func testTagsLoseTheirSpaces() {
        XCTAssertEqual(LineWriter.tag("deep work"), "DeepWork")
    }

    /// Whatever the writer says, the reader has to read back to the same event.
    func testRoundTrip() {
        let cases: [(Date, Date, Bool)] = [
            (date(2026, 9, 30, 9, 30), date(2026, 9, 30, 10), false),
            (date(2026, 10, 1, 7), date(2026, 10, 1, 7, 45), false),
            (date(2026, 10, 2, 22), date(2026, 10, 3, 1), false),
            (date(2026, 10, 12, 14), date(2026, 10, 12, 16), false),
            (date(2027, 3, 1, 8), date(2027, 3, 1, 9), false),
            (date(2026, 10, 3), date(2026, 10, 4), true),
            (date(2026, 9, 30), date(2026, 10, 1), true),
        ]
        for uses24h in [true, false] {
            for (start, end, allDay) in cases {
                let text = LineWriter.event(
                    title: "Plan the week", start: start, end: end, allDay: allDay, sphere: "Deep work",
                    now: now, calendar: calendar, uses24h: uses24h
                )
                let line = LineReader.read(text, vocabulary: vocabulary, now: now, calendar: calendar)
                XCTAssertEqual(line.title, "Plan the week", text)
                XCTAssertEqual(line.sphereId, "work", text)
                XCTAssertEqual(line.intent, .event(start: start, end: end, allDay: allDay), text)
            }
        }
    }
}
