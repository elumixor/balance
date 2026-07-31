import SwiftUI

/// Shown only when Clerk's phone-to-watch session sync hasn't delivered a session yet.
struct NotSignedInView: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "iphone.gen3")
                .font(.system(size: 30))
                .foregroundStyle(.secondary)
            Text("Open Balance on your iPhone and sign in")
                .font(.footnote)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding()
    }
}
