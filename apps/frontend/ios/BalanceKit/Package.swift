// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "BalanceKit",
    platforms: [
        // The phone app links `BalanceTelemetry` alone, and the host target Capacitor generated
        // deploys to iOS 15 — so the package floor is its floor. Nothing in `BalanceKit` itself is
        // ever compiled for iOS; the watch and the widget are the only things that link it.
        .iOS(.v15),
        .watchOS(.v10),
        .macOS(.v14),
    ],
    products: [
        .library(name: "BalanceKit", targets: ["BalanceKit"]),
        // Its own product because the phone app wants the reporting and none of the rest: linking
        // `BalanceKit` there would drag Clerk's whole native SDK into a shell whose sign-in lives
        // in a webview.
        .library(name: "BalanceTelemetry", targets: ["BalanceTelemetry"]),
    ],
    dependencies: [
        .package(url: "https://github.com/clerk/clerk-ios", from: "1.0.0"),
        .package(url: "https://github.com/getsentry/sentry-cocoa", from: "9.0.0"),
        .package(url: "https://github.com/PostHog/posthog-ios", from: "3.0.0"),
    ],
    targets: [
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
    ]
)
