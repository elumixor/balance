import Foundation

/// What the bar above the keyboard offers for the word under the caret.
///
/// A `#` offers spheres and activities, an `@` offers projects, and the start of a day or a time
/// offers the finished word — so nobody has to remember how a token is spelled, only start it.
public struct Suggestion: Equatable, Sendable, Identifiable {
    public enum Kind: Equatable, Sendable { case sphere, activity, project, date, time, duration }

    public let kind: Kind
    /// What the word under the caret is replaced with (a trailing space is added on insert).
    public let insert: String
    public let label: String
    public let refId: String?

    public var id: String { "\(kind)-\(insert)" }
}

public enum Suggest {
    /// The word the caret sits at the end of, as UTF-16 offsets into the text.
    public static func word(in text: String, caret: Int) -> (word: String, range: NSRange)? {
        let ns = text as NSString
        guard caret <= ns.length else { return nil }
        var start = caret
        while start > 0 {
            let c = ns.character(at: start - 1)
            if let scalar = UnicodeScalar(c), CharacterSet.whitespacesAndNewlines.contains(scalar) { break }
            start -= 1
        }
        guard start < caret else { return nil }
        let range = NSRange(location: start, length: caret - start)
        return (ns.substring(with: range), range)
    }

    public static func items(
        for word: String, vocabulary: Vocabulary, limit: Int = 8
    ) -> [Suggestion] {
        if word.hasPrefix("#") {
            let key = Vocabulary.key(String(word.dropFirst()))
            let spheres = vocabulary.spheres.filter { key.isEmpty || Vocabulary.key($0.name).hasPrefix(key) }
                .map { Suggestion(kind: .sphere, insert: "#" + LineWriter.tag($0.name), label: $0.name, refId: $0.id) }
            let activities = vocabulary.activities.filter { key.isEmpty || Vocabulary.key($0.name).hasPrefix(key) }
                .map { Suggestion(kind: .activity, insert: "#" + LineWriter.tag($0.name), label: $0.name, refId: $0.id) }
            return Array((spheres + activities).prefix(limit))
        }
        if word.hasPrefix("@") {
            let key = Vocabulary.key(String(word.dropFirst()))
            return Array(vocabulary.projects.filter { key.isEmpty || Vocabulary.key($0.name).hasPrefix(key) }
                .map { Suggestion(kind: .project, insert: "@" + LineWriter.tag($0.name), label: $0.name, refId: $0.id) }
                .prefix(limit))
        }
        let lower = word.lowercased()
        guard lower.count >= 2 else { return [] }
        let days = ["today", "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        let words = days.filter { $0.hasPrefix(lower) && $0 != lower }
            .map { Suggestion(kind: .date, insert: $0, label: $0.capitalized, refId: nil) }
        return Array(words.prefix(limit))
    }
}
