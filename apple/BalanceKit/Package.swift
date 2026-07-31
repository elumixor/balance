// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "BalanceKit",
    platforms: [
        .iOS(.v17),
        .watchOS(.v10),
        .macOS(.v14),
    ],
    products: [
        .library(name: "BalanceKit", targets: ["BalanceKit"]),
    ],
    dependencies: [
        .package(url: "https://github.com/clerk/clerk-ios", from: "1.0.0"),
    ],
    targets: [
        .target(
            name: "BalanceKit",
            dependencies: [
                .product(name: "ClerkKit", package: "clerk-ios"),
            ]
        ),
    ]
)
