import Foundation

/// A JSON value written out by hand, for the bodies whose absent and `null` fields mean different
/// things — "leave the project alone" and "clear the project" — which a synthesized `Encodable`
/// cannot tell apart.
enum JSON: Encodable, Equatable {
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

    static func from(_ string: String?) -> JSON { string.map(JSON.string) ?? .null }
    static func from(_ number: Double?) -> JSON { number.map(JSON.number) ?? .null }

    /// Any `Encodable` as a JSON tree, by way of the encoder — used for a whole synced record.
    static func encode<T: Encodable>(_ value: T) -> JSON {
        guard let data = try? JSONEncoder().encode(value),
              let object = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
        else { return .null }
        return from(any: object)
    }

    private static func from(any value: Any) -> JSON {
        switch value {
        case is NSNull: return .null
        case let n as NSNumber:
            // `JSONSerialization` hands booleans over as NSNumber too; the type id tells them apart.
            if CFGetTypeID(n) == CFBooleanGetTypeID() { return .bool(n.boolValue) }
            return .number(n.doubleValue)
        case let s as String: return .string(s)
        case let a as [Any]: return .array(a.map(from(any:)))
        case let o as [String: Any]: return .object(o.mapValues(from(any:)))
        default: return .null
        }
    }
}
