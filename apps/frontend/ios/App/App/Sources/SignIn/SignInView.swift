import AuthenticationServices
import SwiftUI

struct SignInView: View {
    @Environment(Session.self) private var session
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            VStack(spacing: 16) {
                Image(systemName: "circle.circle")
                    .font(.system(size: 64, weight: .light))
                Text("Balance")
                    .font(.largeTitle.weight(.semibold))
                Text("Your week, the way you meant it to go.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            Spacer()
            VStack(spacing: 12) {
                SignInWithAppleButton(.continue) { request in
                    request.requestedScopes = [.email, .fullName]
                } onCompletion: { result in
                    Task { await session.signInWithApple(result) }
                }
                .signInWithAppleButtonStyle(scheme == .dark ? .white : .black)
                .frame(height: 50)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                Button {
                    Task { await session.signInWithGoogle() }
                } label: {
                    HStack(spacing: 8) {
                        Text("G").font(.title3.weight(.bold))
                        Text("Continue with Google").font(.body.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)

                if let error = session.error {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .padding(.top, 4)
                }
            }
            .disabled(session.busy)
            .overlay { if session.busy { ProgressView() } }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
    }
}
