import Foundation

/// A JSON value written out by hand, for the bodies whose absent and `null` fields mean different
/// things — "leave the link alone" and "clear the link" — which a synthesized `Encodable`
/// cannot tell apart.
enum JSON: Codable, Hashable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSON])
    case object([String: JSON])

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let v): try c.encode(v)
        case .number(let v):
            if v.rounded() == v, abs(v) < 1e15 { try c.encode(Int(v)) } else { try c.encode(v) }
        case .string(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        }
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([JSON].self) { self = .array(v) }
        else { self = .object(try c.decode([String: JSON].self)) }
    }

    /// The tree as plain Foundation values, for code that reads a record by key.
    var any: Any {
        switch self {
        case .null: return NSNull()
        case .bool(let v): return v
        case .number(let v): return v.rounded() == v && abs(v) < 1e15 ? Int(v) as Any : v
        case .string(let v): return v
        case .array(let v): return v.map(\.any)
        case .object(let v): return v.mapValues(\.any)
        }
    }

    static func from(any value: Any) -> JSON { fromAny(value) }

    static func from(_ string: String?) -> JSON { string.map(JSON.string) ?? .null }
    static func from(_ number: Double?) -> JSON { number.map(JSON.number) ?? .null }

    private static func fromAny(_ value: Any) -> JSON {
        switch value {
        case is NSNull: return .null
        case let n as NSNumber:
            // `JSONSerialization` hands booleans over as NSNumber too; the type id tells them apart.
            if CFGetTypeID(n) == CFBooleanGetTypeID() { return .bool(n.boolValue) }
            return .number(n.doubleValue)
        case let s as String: return .string(s)
        case let a as [Any]: return .array(a.map(fromAny))
        case let o as [String: Any]: return .object(o.mapValues(fromAny))
        default: return .null
        }
    }
}
