import Foundation

/// A line somebody typed, read for what it asks for.
///
/// This is the phone's one way of making and changing things: `gym tomorrow 7:30 45m #health` is
/// the whole form, and everything the screen draws — the highlighted words, the preview under the
/// field, the block that lands on the calendar — is a reading of that line. Nothing here knows what
/// a view is, so every rule about what a word means is tested on its own.
public struct TypedLine: Equatable, Sendable {
    public enum TokenKind: String, Equatable, Sendable {
        case date, time, duration, sphere, repeats
    }

    /// One recognised stretch of the line, for highlighting it where it was typed.
    public struct Token: Equatable, Sendable {
        public let kind: TokenKind
        /// UTF-16 offsets into the line, which is what a text view counts in.
        public let range: NSRange
        /// The sphere or activity it named, when it named one.
        public let refId: String?
    }

    public struct Clock: Equatable, Sendable {
        public let hour: Int
        public let minute: Int
        public init(hour: Int, minute: Int) {
            self.hour = hour
            self.minute = minute
        }
        var minutes: Int { hour * 60 + minute }
    }

    /// What the line turns into once it is submitted.
    public enum Intent: Equatable, Sendable {
        /// A block on the calendar. `allDay` blocks run from `start` to the midnight after `end`'s day.
        case event(start: Date, end: Date, allDay: Bool)
    }

    public let text: String
    public let title: String
    public let tokens: [Token]
    public let day: Date?
    public let time: Clock?
    public let endTime: Clock?
    public let durationMinutes: Int?
    public let sphereId: String?
    public let activityId: String?
    /// An RRULE line, `RRULE:FREQ=WEEKLY;BYDAY=MO`, ready for the calendar.
    public let recurrence: String?
    /// Nil when the line names neither a day nor a time, since there is nowhere to put it.
    public let intent: Intent?
}

/// What a line may name: the account's spheres and activities.
public struct Vocabulary: Sendable {
    public struct Entry: Equatable, Sendable {
        public let id: String
        public let name: String
        public init(id: String, name: String) {
            self.id = id
            self.name = name
        }
    }

    public let spheres: [Entry]
    public let activities: [Entry]

    public init(spheres: [Entry] = [], activities: [Entry] = []) {
        self.spheres = spheres
        self.activities = activities
    }

    public static let empty = Vocabulary()

    /// Names are compared without case, spaces or punctuation, so `#deepwork` finds "Deep work".
    static func key(_ name: String) -> String {
        name.lowercased().unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) }.map(String.init).joined()
    }

    /// The entry a typed name means: an exact match first, then the shortest name it starts.
    static func find(_ typed: String, in entries: [Entry]) -> Entry? {
        let key = key(typed)
        guard !key.isEmpty else { return nil }
        if let exact = entries.first(where: { Self.key($0.name) == key }) { return exact }
        if let start = entries.filter({ Self.key($0.name).hasPrefix(key) }).min(by: { $0.name.count < $1.name.count }) {
            return start
        }
        // Then any word of the name: `#work` finds "Deep work".
        return entries.filter { entry in
            entry.name.split(whereSeparator: { !$0.isLetter && !$0.isNumber }).contains { Self.key(String($0)).hasPrefix(key) }
        }.min { $0.name.count < $1.name.count }
    }
}

public enum LineReader {
    /// A block with no length named is an hour, the same as one drawn on the grid.
    public static let defaultMinutes = 60

    public static func read(
        _ text: String, vocabulary: Vocabulary = .empty, now: Date = Date(), calendar: Calendar = .current
    ) -> TypedLine {
        var scan = Scan(text: text, vocabulary: vocabulary, now: now, calendar: calendar)
        scan.run()
        return scan.result()
    }
}

// MARK: - The scan

private struct Word {
    let raw: String
    /// Lowercased, with trailing punctuation that never belongs to a date or time taken off.
    let key: String
    let range: Range<String.Index>
}

private struct Scan {
    let text: String
    let vocabulary: Vocabulary
    let now: Date
    let calendar: Calendar

    var words: [Word] = []
    var used: [Bool] = []
    var tokens: [(TypedLine.TokenKind, Range<String.Index>, String?)] = []

    var day: Date?
    var time: TypedLine.Clock?
    var endTime: TypedLine.Clock?
    var duration: Int?
    var sphereId: String?
    var activityId: String?
    var recurrence: String?
    var allDay = false
    /// "in 2 hours" names an instant rather than a day and a time.
    var instant: Date?

    init(text: String, vocabulary: Vocabulary, now: Date, calendar: Calendar) {
        self.text = text
        self.vocabulary = vocabulary
        self.now = now
        self.calendar = calendar
        var index = text.startIndex
        while index < text.endIndex {
            guard !text[index].isWhitespace else {
                index = text.index(after: index)
                continue
            }
            var end = index
            while end < text.endIndex, !text[end].isWhitespace { end = text.index(after: end) }
            let raw = String(text[index..<end])
            var key = raw.lowercased()
            while let last = key.last, ",;!?".contains(last) { key.removeLast() }
            if key.hasSuffix("."), !key.dropLast().contains(".") { key.removeLast() }
            words.append(Word(raw: raw, key: key, range: index..<end))
            index = end
        }
        used = Array(repeating: false, count: words.count)
    }

    func key(_ i: Int) -> String? { i < words.count && !used[i] ? words[i].key : nil }

    mutating func take(_ i: Int, _ count: Int, as kind: TypedLine.TokenKind, ref: String? = nil) {
        for j in i..<(i + count) { used[j] = true }
        tokens.append((kind, words[i].range.lowerBound..<words[i + count - 1].range.upperBound, ref))
    }

    mutating func run() {
        var i = 0
        while i < words.count {
            i += max(match(at: i), 1)
        }
    }

    /// Tries every reading at a word and returns how many words it took (0 when none matched).
    mutating func match(at i: Int) -> Int {
        guard let w = key(i) else { return 0 }
        let raw = words[i].raw

        if raw.hasPrefix("#"), raw.count > 1 {
            let name = String(raw.dropFirst())
            if let sphere = Vocabulary.find(name, in: vocabulary.spheres) {
                sphereId = sphere.id
                activityId = nil
                take(i, 1, as: .sphere, ref: sphere.id)
                return 1
            }
            if let activity = Vocabulary.find(name, in: vocabulary.activities) {
                activityId = activity.id
                sphereId = nil
                take(i, 1, as: .sphere, ref: activity.id)
                return 1
            }
            return 0
        }

        if let n = matchRepeat(at: i) { return n }
        if let n = matchRelative(at: i) { return n }

        // "all day" makes a day of its own into an all-day block, today when no day is named.
        if w == "allday" || w == "all-day" || (w == "all" && key(i + 1) == "day") {
            allDay = true
            let n = w == "all" ? 2 : 1
            take(i, n, as: .date)
            return n
        }

        // "for 45m", "for 2 hours"
        if w == "for", let (minutes, n) = Grammar.duration(key(i + 1), key(i + 2)) {
            duration = minutes
            take(i, 1 + n, as: .duration)
            return 1 + n
        }
        // "at 9", "at 7:30pm", "at 9 am" — a bare hour is only a time when "at" says so.
        if w == "at", let (clock, n) = Grammar.clock(key(i + 1), key(i + 2), bareHour: true) {
            time = clock
            endTime = nil
            take(i, 1 + n, as: .time)
            return 1 + n
        }
        if let n = matchRange(at: i) { return n }
        if let (clock, n) = Grammar.clock(w, key(i + 1), bareHour: false) {
            // A later time replaces an earlier range whole, end included.
            time = clock
            endTime = nil
            take(i, n, as: .time)
            return n
        }
        if let (minutes, n) = Grammar.duration(w, key(i + 1)) {
            duration = minutes
            take(i, n, as: .duration)
            return n
        }
        if let (date, n) = Grammar.date(at: i, key: { key($0) }, now: now, calendar: calendar) {
            day = date
            take(i, n, as: .date)
            return n
        }
        return 0
    }

    /// "9-10", "9:00–10:30", "9am - 11am", "14:00 to 15:30".
    mutating func matchRange(at i: Int) -> Int? {
        guard let w = key(i) else { return nil }
        for dash in ["-", "–", "—"] where w.contains(dash) {
            let parts = w.components(separatedBy: dash)
            guard parts.count == 2, !parts[0].isEmpty, !parts[1].isEmpty,
                  let pair = Grammar.clockPair(parts[0], parts[1])
            else { continue }
            (time, endTime) = pair
            take(i, 1, as: .time)
            return 1
        }
        if let joiner = key(i + 1), ["-", "–", "—", "to", "till", "until"].contains(joiner),
           let end = key(i + 2), let pair = Grammar.clockPair(w, end),
           // "3 to 5" alone could be anything; an explicit clock on either side makes it a range.
           Grammar.looksLikeClock(w) || Grammar.looksLikeClock(end) {
            (time, endTime) = pair
            take(i, 3, as: .time)
            return 3
        }
        return nil
    }

    /// "in 3 days", "in 2 weeks", "in 90 minutes", "in an hour".
    mutating func matchRelative(at i: Int) -> Int? {
        guard key(i) == "in", let amountWord = key(i + 1) else { return nil }
        let amount: Int
        if let value = Int(amountWord) {
            amount = value
        } else if amountWord == "a" || amountWord == "an" {
            amount = 1
        } else if let (minutes, taken) = Grammar.duration(amountWord, key(i + 2)) {
            instant = now.addingTimeInterval(TimeInterval(minutes * 60))
            take(i, 1 + taken, as: .time)
            return 1 + taken
        } else {
            return nil
        }
        guard let unit = key(i + 2) else { return nil }
        let n = 3
        switch unit {
        case "day", "days", "d":
            day = calendar.date(byAdding: .day, value: amount, to: calendar.startOfDay(for: now))
            take(i, n, as: .date)
        case "week", "weeks", "w":
            day = calendar.date(byAdding: .day, value: 7 * amount, to: calendar.startOfDay(for: now))
            take(i, n, as: .date)
        case "hour", "hours", "h", "hr", "hrs":
            instant = now.addingTimeInterval(TimeInterval(amount * 3600))
            take(i, n, as: .time)
        case "minute", "minutes", "min", "mins", "m":
            instant = now.addingTimeInterval(TimeInterval(amount * 60))
            take(i, n, as: .time)
        default:
            return nil
        }
        return n
    }

    /// "daily", "weekly", "weekdays", "every day", "every monday", "every tue and thu".
    mutating func matchRepeat(at i: Int) -> Int? {
        guard let w = key(i) else { return nil }
        switch w {
        case "daily":
            recurrence = "RRULE:FREQ=DAILY"
            take(i, 1, as: .repeats)
            return 1
        case "weekly":
            recurrence = "RRULE:FREQ=WEEKLY"
            take(i, 1, as: .repeats)
            return 1
        case "weekdays":
            recurrence = "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
            take(i, 1, as: .repeats)
            return 1
        case "monthly":
            recurrence = "RRULE:FREQ=MONTHLY"
            take(i, 1, as: .repeats)
            return 1
        case "every", "each":
            guard let next = key(i + 1) else { return nil }
            switch next {
            case "day":
                recurrence = "RRULE:FREQ=DAILY"
            case "weekday", "weekdays":
                recurrence = "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
            case "week":
                recurrence = "RRULE:FREQ=WEEKLY"
            case "month":
                recurrence = "RRULE:FREQ=MONTHLY"
            default:
                var days: [String] = []
                var j = i + 1
                while let word = key(j) {
                    if let code = Grammar.weekdayCode(word) {
                        days.append(code)
                    } else if !(word == "and" || word == "&" || word == ",") || days.isEmpty {
                        break
                    }
                    j += 1
                }
                // A trailing "and" belongs to the sentence, not the list.
                while j > i + 1, let last = key(j - 1), Grammar.weekdayCode(last) == nil { j -= 1 }
                guard !days.isEmpty else { return nil }
                recurrence = "RRULE:FREQ=WEEKLY;BYDAY=\(days.joined(separator: ","))"
                // The first day it repeats on is the day it starts, unless a day was said as well.
                if day == nil, let first = days.first {
                    day = Grammar.upcoming(weekday: first, from: now, calendar: calendar)
                }
                take(i, j - i, as: .repeats)
                return j - i
            }
            take(i, 2, as: .repeats)
            return 2
        default:
            return nil
        }
    }

    func result() -> TypedLine {
        let utf16Tokens = tokens.map { kind, range, ref in
            TypedLine.Token(kind: kind, range: NSRange(range, in: text), refId: ref)
        }.sorted { $0.range.location < $1.range.location }

        var titleWords = words.indices.filter { !used[$0] }.map { words[$0].raw }
        // "call mom at" once "at 9" became a time, or "lunch on" before a date that was taken.
        let dangling: Set<String> = ["at", "on", "for", "from", "by", "in", "#", "-", "–"]
        while let last = titleWords.last, dangling.contains(last.lowercased()) { titleWords.removeLast() }
        while let first = titleWords.first, dangling.contains(first.lowercased()), titleWords.count > 1 {
            titleWords.removeFirst()
        }
        let title = titleWords.joined(separator: " ")

        var resolvedDay = day
        var resolvedTime = time
        if let instant {
            resolvedDay = calendar.startOfDay(for: instant)
            let parts = calendar.dateComponents([.hour, .minute], from: instant)
            resolvedTime = TypedLine.Clock(hour: parts.hour ?? 0, minute: parts.minute ?? 0)
        }
        if resolvedDay == nil, resolvedTime != nil || recurrence != nil || allDay {
            resolvedDay = calendar.startOfDay(for: now)
        }

        let intent: TypedLine.Intent?
        if let clock = resolvedTime, let base = resolvedDay {
            let start = Grammar.at(clock, on: base, calendar: calendar)
            var end: Date
            if let endClock = endTime {
                end = Grammar.at(endClock, on: base, calendar: calendar)
                if end <= start { end = calendar.date(byAdding: .day, value: 1, to: end) ?? end }
            } else {
                end = start.addingTimeInterval(TimeInterval((duration ?? LineReader.defaultMinutes) * 60))
            }
            intent = .event(start: start, end: end, allDay: false)
        } else if let base = resolvedDay {
            let end = calendar.date(byAdding: .day, value: 1, to: base) ?? base
            intent = .event(start: base, end: end, allDay: true)
        } else {
            intent = nil
        }

        return TypedLine(
            text: text, title: title, tokens: utf16Tokens, day: resolvedDay, time: resolvedTime,
            endTime: endTime, durationMinutes: duration, sphereId: sphereId, activityId: activityId,
            recurrence: recurrence, intent: intent
        )
    }
}

// MARK: - Grammar

enum Grammar {
    static let weekdays: [(names: [String], code: String, index: Int)] = [
        (["monday", "mon"], "MO", 2),
        (["tuesday", "tue", "tues"], "TU", 3),
        (["wednesday", "wed"], "WE", 4),
        (["thursday", "thu", "thur", "thurs"], "TH", 5),
        (["friday", "fri"], "FR", 6),
        // "sat" and "sun" are words too often to be read as days.
        (["saturday"], "SA", 7),
        (["sunday"], "SU", 1),
    ]

    static let months: [String: Int] = [
        "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3, "apr": 4, "april": 4,
        "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7, "aug": 8, "august": 8, "sep": 9, "sept": 9,
        "september": 9, "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
    ]

    static func weekdayCode(_ word: String) -> String? {
        var w = word
        if w.hasSuffix("s"), w.count > 4 { w.removeLast() }  // "mondays"
        return weekdays.first { $0.names.contains(w) }?.code
    }

    static func upcoming(weekday code: String, from now: Date, calendar: Calendar) -> Date? {
        guard let target = weekdays.first(where: { $0.code == code })?.index else { return nil }
        let today = calendar.startOfDay(for: now)
        let current = calendar.component(.weekday, from: today)
        let ahead = (target - current + 7) % 7
        return calendar.date(byAdding: .day, value: ahead, to: today)
    }

    static func at(_ clock: TypedLine.Clock, on day: Date, calendar: Calendar) -> Date {
        calendar.date(bySettingHour: clock.hour, minute: clock.minute, second: 0, of: day) ?? day
    }

    /// Whether a word is unmistakably a time of day rather than a number.
    static func looksLikeClock(_ word: String) -> Bool {
        word.contains(":") || word.hasSuffix("am") || word.hasSuffix("pm") || word == "noon" || word == "midnight"
    }

    /// A time of day from one or two words: "9am", "9:30", "21:00", "9 am", "noon". A bare number
    /// ("9") is only accepted when `bareHour` says the sentence already asked for a time.
    static func clock(_ word: String?, _ next: String?, bareHour: Bool) -> (TypedLine.Clock, Int)? {
        guard let word else { return nil }
        if word == "noon" || word == "midday" { return (.init(hour: 12, minute: 0), 1) }
        if word == "midnight" { return (.init(hour: 0, minute: 0), 1) }
        if let next, next == "am" || next == "pm", let c = clockText(word + next, bareHour: true) { return (c, 2) }
        if let c = clockText(word, bareHour: bareHour) { return (c, 1) }
        return nil
    }

    static func clockText(_ word: String, bareHour: Bool) -> TypedLine.Clock? {
        var w = word
        var meridiem: String?
        for suffix in ["am", "pm", "a", "p"] where w.hasSuffix(suffix) && w.count > suffix.count {
            let head = String(w.dropLast(suffix.count))
            guard head.last?.isNumber == true else { continue }
            meridiem = suffix.hasPrefix("a") ? "am" : "pm"
            w = head
            break
        }
        let parts = w.split(separator: ":", omittingEmptySubsequences: false)
        guard parts.count <= 2, let hour = Int(parts[0]), parts[0].count <= 2 else { return nil }
        var minute = 0
        if parts.count == 2 {
            guard parts[1].count == 2, let m = Int(parts[1]), m < 60 else { return nil }
            minute = m
        } else if meridiem == nil, !bareHour {
            return nil
        }
        if let meridiem {
            guard (1...12).contains(hour) else { return nil }
            let h = hour % 12 + (meridiem == "pm" ? 12 : 0)
            return .init(hour: h, minute: minute)
        }
        guard (0...23).contains(hour) else { return nil }
        // "at 3" in a sentence about a day means the afternoon, as "3" on a clock face would.
        if parts.count == 1, (1...7).contains(hour) { return .init(hour: hour + 12, minute: minute) }
        return .init(hour: hour, minute: minute)
    }

    /// Both ends of a range. The end's am/pm carries to a start that didn't say ("9-11am").
    static func clockPair(_ a: String, _ b: String) -> (TypedLine.Clock, TypedLine.Clock)? {
        guard let end = clockText(b, bareHour: true) else { return nil }
        let endMeridiem = b.hasSuffix("am") ? "am" : b.hasSuffix("pm") ? "pm" : nil
        var start: TypedLine.Clock?
        if let meridiem = endMeridiem, !(a.hasSuffix("am") || a.hasSuffix("pm")) {
            start = clockText(a + meridiem, bareHour: true)
            // "11-1pm" is eleven in the morning, not eleven at night.
            if let s = start, s.minutes > end.minutes, meridiem == "pm" {
                start = clockText(a + "am", bareHour: true)
            }
        } else {
            start = clockText(a, bareHour: true)
        }
        guard var s = start else { return nil }
        var e = end
        // "9-5" is a working day, not eight hours back in time.
        if !looksLikeClock(a), !looksLikeClock(b), e.minutes <= s.minutes, e.hour < 12 {
            e = .init(hour: e.hour + 12, minute: e.minute)
        }
        if !looksLikeClock(a), s.hour >= 12, e.minutes <= s.minutes, s.hour - 12 < e.hour {
            s = .init(hour: s.hour - 12, minute: s.minute)
        }
        return (s, e)
    }

    /// "45m", "1h", "1h30", "1.5h", "90min", "2 hours", "30 mins".
    static func duration(_ word: String?, _ next: String?) -> (Int, Int)? {
        guard let word else { return nil }
        if let minutes = durationText(word) { return (minutes, 1) }
        if let next, let amount = Double(word), amount > 0 {
            switch next {
            case "h", "hr", "hrs", "hour", "hours": return (Int((amount * 60).rounded()), 2)
            case "m", "min", "mins", "minute", "minutes": return (Int(amount.rounded()), 2)
            default: break
            }
        }
        if word == "an" || word == "a", next == "hour" { return (60, 2) }
        return nil
    }

    static func durationText(_ word: String) -> Int? {
        let w = word
        if let range = w.range(of: #"^(\d+)h(\d{1,2})m?$"#, options: .regularExpression), range == w.startIndex..<w.endIndex {
            let digits = w.split(whereSeparator: { !$0.isNumber }).compactMap { Int($0) }
            guard digits.count == 2, digits[1] < 60 else { return nil }
            return digits[0] * 60 + digits[1]
        }
        for unit in ["hours", "hour", "hrs", "hr", "h"] where w.hasSuffix(unit) {
            if let v = Double(w.dropLast(unit.count)), v > 0 { return Int((v * 60).rounded()) }
        }
        for unit in ["minutes", "minute", "mins", "min", "m"] where w.hasSuffix(unit) {
            if let v = Int(w.dropLast(unit.count)), v > 0 { return v }
        }
        return nil
    }

    /// A day, from one to three words starting at `i`.
    static func date(
        at i: Int, key: (Int) -> String?, now: Date, calendar: Calendar
    ) -> (Date, Int)? {
        guard let w = key(i) else { return nil }
        let today = calendar.startOfDay(for: now)
        func shift(_ days: Int) -> Date { calendar.date(byAdding: .day, value: days, to: today) ?? today }

        switch w {
        case "today", "tod", "tonight": return (today, 1)
        case "tomorrow", "tmr", "tmrw", "tomorow": return (shift(1), 1)
        case "yesterday": return (shift(-1), 1)
        default: break
        }
        if w == "next" || w == "this", let next = key(i + 1) {
            if let code = weekdayCode(next), let upcoming = upcoming(weekday: code, from: now, calendar: calendar) {
                if w == "this" { return (upcoming, 2) }
                // "next friday" is the Friday of next week, counted in Monday-first weeks.
                var mondays = calendar
                mondays.firstWeekday = 2
                let thisWeek = mondays.dateInterval(of: .weekOfYear, for: today)?.start ?? today
                let nextWeek = calendar.date(byAdding: .day, value: 7, to: thisWeek) ?? today
                let target = weekdays.first { $0.code == code }!.index
                let offset = (target + 5) % 7  // Monday = 0
                return (calendar.date(byAdding: .day, value: offset, to: nextWeek) ?? upcoming, 2)
            }
            if next == "week" {
                var mondays = calendar
                mondays.firstWeekday = 2
                let thisWeek = mondays.dateInterval(of: .weekOfYear, for: today)?.start ?? today
                return (calendar.date(byAdding: .day, value: 7, to: thisWeek) ?? today, 2)
            }
        }
        if let code = weekdayCode(w), weekdays.contains(where: { $0.names.contains(w) }),
           let upcoming = upcoming(weekday: code, from: now, calendar: calendar) {
            return (upcoming, 1)
        }
        // "oct 3", "october 3rd", "3 oct", "3rd of october"
        if let month = months[w], let next = key(i + 1), let d = ordinal(next),
           let date = make(day: d, month: month, now: now, calendar: calendar) {
            return (date, 2)
        }
        if let d = ordinal(w), let next = key(i + 1) {
            if let month = months[next], let date = make(day: d, month: month, now: now, calendar: calendar) {
                return (date, 2)
            }
            if next == "of", let after = key(i + 2), let month = months[after],
               let date = make(day: d, month: month, now: now, calendar: calendar) {
                return (date, 3)
            }
        }
        // 2026-10-03
        let iso = w.split(separator: "-")
        if iso.count == 3, iso[0].count == 4, let y = Int(iso[0]), let m = Int(iso[1]), let d = Int(iso[2]) {
            if let date = calendar.date(from: DateComponents(year: y, month: m, day: d)),
               calendar.component(.month, from: date) == m {
                return (date, 1)
            }
        }
        // 3.10, 3/10, 03.10.26 — day first, as it is written almost everywhere but one country.
        for separator in [".", "/"] where w.contains(separator) {
            let parts = w.split(separator: Character(separator), omittingEmptySubsequences: false)
            guard parts.count == 2 || parts.count == 3, let d = Int(parts[0]), let m = Int(parts[1]) else { continue }
            var year: Int?
            if parts.count == 3 {
                guard let y = Int(parts[2]) else { continue }
                year = y < 100 ? 2000 + y : y
            }
            if let date = make(day: d, month: m, year: year, now: now, calendar: calendar) { return (date, 1) }
        }
        return nil
    }

    static func ordinal(_ word: String) -> Int? {
        var w = word
        for suffix in ["st", "nd", "rd", "th"] where w.hasSuffix(suffix) {
            w.removeLast(suffix.count)
            break
        }
        guard let d = Int(w), (1...31).contains(d) else { return nil }
        return d
    }

    static func make(day: Int, month: Int, year: Int? = nil, now: Date, calendar: Calendar) -> Date? {
        guard (1...12).contains(month), (1...31).contains(day) else { return nil }
        let y = year ?? calendar.component(.year, from: now)
        guard let date = calendar.date(from: DateComponents(year: y, month: month, day: day)),
              calendar.component(.day, from: date) == day
        else { return nil }
        return date
    }
}
