import XCTest
@testable import BalanceCore

final class TypedLineTests: XCTestCase {
    var calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Amsterdam")!
        return c
    }()

    /// Wednesday 30 September 2026, ten in the morning.
    lazy var now = date(2026, 9, 30, 10, 0)

    let vocabulary = Vocabulary(
        spheres: [.init(id: "health", name: "Health"), .init(id: "work", name: "Deep work"), .init(id: "rest", name: "Rest")],
        activities: [.init(id: "gym", name: "Gym session")],
        projects: [.init(id: "atma", name: "ATMA"), .init(id: "hyp", name: "Hypocrisy combat")]
    )

    func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0, _ min: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: min))!
    }

    func read(_ text: String) -> TypedLine {
        LineReader.read(text, vocabulary: vocabulary, now: now, calendar: calendar)
    }

    func assertEvent(_ line: TypedLine, _ start: Date, _ end: Date, allDay: Bool = false, file: StaticString = #filePath, line l: UInt = #line) {
        guard case let .event(s, e, a) = line.intent else {
            return XCTFail("expected an event, got \(String(describing: line.intent))", file: file, line: l)
        }
        XCTAssertEqual(s, start, "start", file: file, line: l)
        XCTAssertEqual(e, end, "end", file: file, line: l)
        XCTAssertEqual(a, allDay, "allDay", file: file, line: l)
    }

    // MARK: Times and days

    func testTimeAloneIsTodayForAnHour() {
        let line = read("Standup 9:30")
        XCTAssertEqual(line.title, "Standup")
        assertEvent(line, date(2026, 9, 30, 9, 30), date(2026, 9, 30, 10, 30))
    }

    func testTomorrowWithMeridiemAndDuration() {
        let line = read("gym tomorrow 7am 45m #health")
        XCTAssertEqual(line.title, "gym")
        XCTAssertEqual(line.sphereId, "health")
        assertEvent(line, date(2026, 10, 1, 7), date(2026, 10, 1, 7, 45))
    }

    func testRangeWithDash() {
        assertEvent(read("Review 14:00-15:30"), date(2026, 9, 30, 14), date(2026, 9, 30, 15, 30))
        assertEvent(read("Review 14:00–15:30"), date(2026, 9, 30, 14), date(2026, 9, 30, 15, 30))
    }

    func testRangeCarriesMeridiemBackwards() {
        assertEvent(read("lunch 12-1pm"), date(2026, 9, 30, 12), date(2026, 9, 30, 13))
        assertEvent(read("lunch 11-1pm"), date(2026, 9, 30, 11), date(2026, 9, 30, 13))
        assertEvent(read("call 9-11am"), date(2026, 9, 30, 9), date(2026, 9, 30, 11))
    }

    func testBareRangeIsAWorkingDay() {
        assertEvent(read("office 9-5"), date(2026, 9, 30, 9), date(2026, 9, 30, 17))
    }

    func testRangeWithWords() {
        assertEvent(read("focus 9:00 to 11:00"), date(2026, 9, 30, 9), date(2026, 9, 30, 11))
        let line = read("focus 9:00 - 11:00 tomorrow")
        assertEvent(line, date(2026, 10, 1, 9), date(2026, 10, 1, 11))
        XCTAssertEqual(line.title, "focus")
    }

    func testRangeAcrossMidnight() {
        assertEvent(read("party 22:00-01:00"), date(2026, 9, 30, 22), date(2026, 10, 1, 1))
    }

    func testAtBareHourMeansAfternoonForSmallHours() {
        let line = read("call mom at 3")
        XCTAssertEqual(line.title, "call mom")
        assertEvent(line, date(2026, 9, 30, 15), date(2026, 9, 30, 16))
        assertEvent(read("breakfast at 9"), date(2026, 9, 30, 9), date(2026, 9, 30, 10))
    }

    func testBareNumberIsNotATime() {
        let line = read("buy 3 apples")
        XCTAssertEqual(line.title, "buy 3 apples")
        XCTAssertNil(line.time)
        XCTAssertEqual(line.intent, .task(day: nil))
    }

    func testAtWithoutTimeStaysInTitle() {
        XCTAssertEqual(read("dinner at home 19:00").title, "dinner at home")
    }

    func testSeparateMeridiem() {
        assertEvent(read("run 6 pm"), date(2026, 9, 30, 18), date(2026, 9, 30, 19))
        assertEvent(read("run at 6 am"), date(2026, 9, 30, 6), date(2026, 9, 30, 7))
    }

    func testNoonAndMidnight() {
        assertEvent(read("lunch noon"), date(2026, 9, 30, 12), date(2026, 9, 30, 13))
        assertEvent(read("sleep midnight 8h"), date(2026, 9, 30, 0), date(2026, 9, 30, 8))
    }

    func testTwelveAmAndPm() {
        assertEvent(read("x 12am"), date(2026, 9, 30, 0), date(2026, 9, 30, 1))
        assertEvent(read("x 12pm"), date(2026, 9, 30, 12), date(2026, 9, 30, 13))
    }

    func testInvalidClocksAreText() {
        XCTAssertNil(read("x 25:00").time)
        XCTAssertNil(read("x 9:75").time)
        XCTAssertNil(read("x 13pm").time)
    }

    func testWeekdaysAreUpcomingIncludingToday() {
        XCTAssertEqual(read("x wednesday").day, date(2026, 9, 30))
        XCTAssertEqual(read("x friday").day, date(2026, 10, 2))
        XCTAssertEqual(read("x mon").day, date(2026, 10, 5))
        XCTAssertEqual(read("x sunday").day, date(2026, 10, 4))
    }

    func testSatAndSunAreWords() {
        let line = read("sun lotion")
        XCTAssertEqual(line.title, "sun lotion")
        XCTAssertNil(line.day)
    }

    func testNextWeekday() {
        // Next week starts Monday 5 October.
        XCTAssertEqual(read("x next friday").day, date(2026, 10, 9))
        XCTAssertEqual(read("x next monday").day, date(2026, 10, 5))
        XCTAssertEqual(read("x this friday").day, date(2026, 10, 2))
        XCTAssertEqual(read("x next week").day, date(2026, 10, 5))
    }

    func testDayWords() {
        XCTAssertEqual(read("x today").day, date(2026, 9, 30))
        XCTAssertEqual(read("x tmr").day, date(2026, 10, 1))
        XCTAssertEqual(read("x yesterday").day, date(2026, 9, 29))
    }

    func testDateOnlyIsAllDay() {
        let line = read("Mum's birthday 3.10")
        XCTAssertEqual(line.title, "Mum's birthday")
        assertEvent(line, date(2026, 10, 3), date(2026, 10, 4), allDay: true)
    }

    func testAllDayBeatsAProject() {
        let line = read("offsite @atma friday all day")
        XCTAssertEqual(line.title, "offsite")
        assertEvent(line, date(2026, 10, 2), date(2026, 10, 3), allDay: true)
        assertEvent(read("holiday allday"), date(2026, 9, 30), date(2026, 10, 1), allDay: true)
    }

    func testDateFormats() {
        XCTAssertEqual(read("x 3/10").day, date(2026, 10, 3))
        XCTAssertEqual(read("x 03.10.27").day, date(2027, 10, 3))
        XCTAssertEqual(read("x 2026-12-24").day, date(2026, 12, 24))
        XCTAssertEqual(read("x oct 3").day, date(2026, 10, 3))
        XCTAssertEqual(read("x 3rd october").day, date(2026, 10, 3))
        XCTAssertEqual(read("x 3rd of october").day, date(2026, 10, 3))
        XCTAssertEqual(read("x december 1st").day, date(2026, 12, 1))
    }

    func testImpossibleDatesAreText() {
        XCTAssertNil(read("x 31.2").day)
        XCTAssertNil(read("x 2026-02-30").day)
        XCTAssertNil(read("x 3.13").day)
    }

    func testRelative() {
        XCTAssertEqual(read("x in 3 days").day, date(2026, 10, 3))
        XCTAssertEqual(read("x in 2 weeks").day, date(2026, 10, 14))
        assertEvent(read("tea in 2 hours"), date(2026, 9, 30, 12), date(2026, 9, 30, 13))
        assertEvent(read("tea in 30 min"), date(2026, 9, 30, 10, 30), date(2026, 9, 30, 11, 30))
        assertEvent(read("tea in an hour"), date(2026, 9, 30, 11), date(2026, 9, 30, 12))
        assertEvent(read("tea in 45m"), date(2026, 9, 30, 10, 45), date(2026, 9, 30, 11, 45))
    }

    func testInAsAWord() {
        let line = read("lunch in town 13:00")
        XCTAssertEqual(line.title, "lunch in town")
    }

    // MARK: Durations

    func testDurations() {
        XCTAssertEqual(read("x 9:00 1h30").durationMinutes, 90)
        XCTAssertEqual(read("x 9:00 1h30m").durationMinutes, 90)
        XCTAssertEqual(read("x 9:00 1.5h").durationMinutes, 90)
        XCTAssertEqual(read("x 9:00 90min").durationMinutes, 90)
        XCTAssertEqual(read("x 9:00 for 2 hours").durationMinutes, 120)
        XCTAssertEqual(read("x 9:00 30 mins").durationMinutes, 30)
        XCTAssertEqual(read("x 9:00 for an hour").durationMinutes, 60)
        XCTAssertNil(read("x 9:00 1h75").durationMinutes)
    }

    func testEndTimeBeatsDuration() {
        assertEvent(read("x 9:00-10:00 3h"), date(2026, 9, 30, 9), date(2026, 9, 30, 10))
    }

    func testForWithoutDurationStaysText() {
        XCTAssertEqual(read("dinner for two 19:00").title, "dinner for two")
    }

    // MARK: Spheres and projects

    func testSphereByPrefixAndSpacelessName() {
        XCTAssertEqual(read("x #hea").sphereId, "health")
        XCTAssertEqual(read("x #deepwork").sphereId, "work")
        XCTAssertEqual(read("x #DeepWork").sphereId, "work")
        XCTAssertEqual(read("x #rest").sphereId, "rest")
    }

    func testActivityIsASphereToken() {
        let line = read("lift #gymsession 18:00")
        XCTAssertEqual(line.activityId, "gym")
        XCTAssertNil(line.sphereId)
        XCTAssertEqual(line.tokens.first { $0.kind == .sphere }?.refId, "gym")
    }

    func testUnknownTagStaysInTitle() {
        let line = read("x #nothing")
        XCTAssertEqual(line.title, "x #nothing")
        XCTAssertNil(line.sphereId)
    }

    func testProjectMakesATask() {
        let line = read("write combat notes @hyp")
        XCTAssertEqual(line.projectId, "hyp")
        XCTAssertEqual(line.title, "write combat notes")
        XCTAssertEqual(line.intent, .task(day: nil))
    }

    func testProjectWithDayIsADatedTask() {
        XCTAssertEqual(read("ship build @atma friday").intent, .task(day: date(2026, 10, 2)))
    }

    func testProjectWithTimeIsAnEventForThatProject() {
        let line = read("ship build @atma friday 14:00 2h")
        XCTAssertEqual(line.projectId, "atma")
        assertEvent(line, date(2026, 10, 2, 14), date(2026, 10, 2, 16))
    }

    func testPlainLineIsATask() {
        XCTAssertEqual(read("buy milk").intent, .task(day: nil))
    }

    func testEmptyLineHasNoIntent() {
        XCTAssertNil(read("").intent)
        XCTAssertNil(read("   ").intent)
    }

    // MARK: Repeats

    func testRepeats() {
        XCTAssertEqual(read("standup 9:30 weekdays").recurrence, "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")
        XCTAssertEqual(read("standup 9:30 every day").recurrence, "RRULE:FREQ=DAILY")
        XCTAssertEqual(read("gym every mon and thu 7am").recurrence, "RRULE:FREQ=WEEKLY;BYDAY=MO,TH")
        XCTAssertEqual(read("gym every mondays 7am").recurrence, "RRULE:FREQ=WEEKLY;BYDAY=MO")
    }

    func testRepeatStartsOnItsFirstDay() {
        let line = read("gym every friday 7am")
        XCTAssertEqual(line.title, "gym")
        assertEvent(line, date(2026, 10, 2, 7), date(2026, 10, 2, 8))
    }

    func testEveryAloneIsAWord() {
        XCTAssertEqual(read("read every page").title, "read every page")
        XCTAssertNil(read("read every page").recurrence)
    }

    func testEveryDayAndTrailingAnd() {
        let line = read("walk every monday and")
        XCTAssertEqual(line.recurrence, "RRULE:FREQ=WEEKLY;BYDAY=MO")
        XCTAssertEqual(line.title, "walk and")
    }

    // MARK: Tokens and title

    func testTokensCoverWhatWasTyped() {
        let text = "gym tomorrow 7am 45m #health"
        let line = read(text)
        let ns = text as NSString
        XCTAssertEqual(line.tokens.map { ns.substring(with: $0.range) }, ["tomorrow", "7am", "45m", "#health"])
        XCTAssertEqual(line.tokens.map(\.kind), [.date, .time, .duration, .sphere])
    }

    func testTokenRangesAreUTF16() {
        let text = "🏋️ gym 7am"
        let line = read(text)
        XCTAssertEqual((text as NSString).substring(with: line.tokens[0].range), "7am")
        XCTAssertEqual(line.title, "🏋️ gym")
    }

    func testDanglingConnectorsLeaveTitle() {
        XCTAssertEqual(read("lunch on friday at 13:00").title, "lunch")
        XCTAssertEqual(read("meeting from 9:00 to 10:00").title, "meeting")
    }

    func testPunctuationAfterADay() {
        XCTAssertEqual(read("call, tomorrow, 9am").day, date(2026, 10, 1))
    }

    func testLastWins() {
        XCTAssertEqual(read("x 9:00 10:00").time, .init(hour: 10, minute: 0))
    }

    func testATimeAfterARangeReplacesItWhole() {
        assertEvent(read("gym 18:00-19:00 20:00"), date(2026, 9, 30, 20), date(2026, 9, 30, 21))
        assertEvent(read("gym 18:00-19:00 at 7am 30m"), date(2026, 9, 30, 7), date(2026, 9, 30, 7, 30))
    }
}
