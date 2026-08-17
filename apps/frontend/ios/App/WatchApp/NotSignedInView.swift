import SwiftUI

/// Shown until the phone has handed a session across. Opening Balance on the phone is what
/// produces the ticket this app redeems, so that — rather than anything to do here — is the ask.
struct NotSignedInView: View {
    var isPairing = false

    var body: some View {
        VStack(spacing: 8) {
            if isPairing {
                ProgressView()
                Text("Signing in…")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                Image(systemName: "iphone.gen3")
                    .font(.system(size: 30))
                    .foregroundStyle(.secondary)
                Text("Open Balance on your iPhone")
                    .font(.footnote)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
    }
}
