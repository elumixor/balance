import ClerkKit
import Foundation

/// Public, non-secret key — safe to compile into the app. Same Clerk instance the web app uses.
public let clerkPublishableKey = "pk_test_Y2VudHJhbC1jb25kb3ItMzguY2xlcmsuYWNjb3VudHMuZGV2JA"

@MainActor
public func configureClerk() {
    Clerk.configure(publishableKey: clerkPublishableKey)
}
