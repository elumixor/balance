// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "BalanceKit",
    platforms: [
        // The phone app is native SwiftUI on iOS 18, and links all three libraries.
        .iOS(.v18),
        .watchOS(.v10),
        .macOS(.v14),
    ],
    products: [
        .library(name: "BalanceKit", targets: ["BalanceKit"]),
        .library(name: "BalanceTelemetry", targets: ["BalanceTelemetry"]),
        // What the phone app reads a typed line with and lays a day out by — Foundation only, so
        // `swift test` checks every rule on the Mac without a simulator.
        .library(name: "BalanceCore", targets: ["BalanceCore"]),
    ],
    dependencies: [
        .package(url: "https://github.com/clerk/clerk-ios", from: "1.0.0"),
        .package(url: "https://github.com/getsentry/sentry-cocoa", from: "9.0.0"),
        .package(url: "https://github.com/PostHog/posthog-ios", from: "3.0.0"),
    ],
    targets: [
        .target(name: "BalanceCore"),
        .testTarget(name: "BalanceCoreTests", dependencies: ["BalanceCore"]),
        .target(
            name: "BalanceTelemetry",
            dependencies: [
                .product(name: "Sentry", package: "sentry-cocoa"),
                .product(name: "PostHog", package: "posthog-ios"),
            ]
        ),
        .target(
            name: "BalanceKit",
            dependencies: [
                .product(name: "ClerkKit", package: "clerk-ios"),
                "BalanceTelemetry",
            ]
        ),
    ],
    // Swift 6's strict concurrency checking is a migration of its own; the code is written for 5.
    swiftLanguageModes: [.v5]
)
