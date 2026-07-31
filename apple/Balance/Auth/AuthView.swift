import SwiftUI
import ClerkKit
import AuthenticationServices

/// Minimal native email/password sign-in & sign-up flow using ClerkKit's Auth APIs directly.
/// (ClerkKitUI's prebuilt views aren't linked as an app-target dependency in project.yml, so we
/// talk to Clerk.shared.auth / SignIn / SignUp directly here instead of adding a new package product.)
struct AuthView: View {
    private enum Mode {
        case signIn, signUp
    }

    private enum Step {
        case form
        case verifyEmailCode
    }

    @State private var mode: Mode = .signIn
    @State private var step: Step = .form

    @State private var email = ""
    @State private var password = ""
    @State private var code = ""

    @State private var pendingSignUp: SignUp?
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    VStack(spacing: 4) {
                        Image(systemName: "scale.3d")
                            .font(.system(size: 44))
                            .foregroundStyle(.tint)
                        Text("Balance")
                            .font(.largeTitle.bold())
                    }
                    .padding(.top, 40)

                    switch step {
                    case .form:
                        VStack(spacing: 16) {
                            socialButtons
                            dividerWithLabel
                            formSection
                        }
                    case .verifyEmailCode:
                        verifySection
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.horizontal, 24)
            }
            .scrollDismissesKeyboard(.interactively)
        }
    }

    private var socialButtons: some View {
        VStack(spacing: 12) {
            Button {
                Task { await signInWithApple() }
            } label: {
                HStack {
                    Image(systemName: "apple.logo")
                    Text("Continue with Apple")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.black)
            .controlSize(.large)

            Button {
                Task { await signInWithOAuth(.google) }
            } label: {
                HStack {
                    Image(systemName: "globe")
                    Text("Continue with Google")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
        }
        .disabled(isSubmitting)
    }

    private var dividerWithLabel: some View {
        HStack(spacing: 12) {
            Rectangle().frame(height: 1).foregroundStyle(.separator)
            Text("or")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Rectangle().frame(height: 1).foregroundStyle(.separator)
        }
    }

    private var formSection: some View {
        VStack(spacing: 16) {
            Picker("Mode", selection: $mode) {
                Text("Sign In").tag(Mode.signIn)
                Text("Sign Up").tag(Mode.signUp)
            }
            .pickerStyle(.segmented)
            .onChange(of: mode) { errorMessage = nil }

            TextField("Email", text: $email)
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding()
                .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: 10))

            SecureField("Password", text: $password)
                .textContentType(mode == .signIn ? .password : .newPassword)
                .padding()
                .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: 10))

            Button {
                Task { await submitForm() }
            } label: {
                if isSubmitting {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                } else {
                    Text(mode == .signIn ? "Sign In" : "Sign Up")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(email.isEmpty || password.isEmpty || isSubmitting)
        }
    }

    private var verifySection: some View {
        VStack(spacing: 16) {
            Text("Enter the verification code sent to \(email)")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            TextField("Code", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .multilineTextAlignment(.center)
                .font(.title2.monospacedDigit())
                .padding()
                .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: 10))

            Button {
                Task { await submitCode() }
            } label: {
                if isSubmitting {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                } else {
                    Text("Verify")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(code.isEmpty || isSubmitting)

            Button("Back") {
                step = .form
                errorMessage = nil
                code = ""
            }
            .font(.footnote)
        }
    }

    private func signInWithApple() async {
        errorMessage = nil
        isSubmitting = true
        defer { isSubmitting = false }

        do {
            try await Clerk.shared.auth.signInWithApple()
        } catch let error as ASAuthorizationError where error.code == .canceled {
            // User dismissed the Apple sign-in sheet.
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func signInWithOAuth(_ provider: OAuthProvider) async {
        errorMessage = nil
        isSubmitting = true
        defer { isSubmitting = false }

        do {
            try await Clerk.shared.auth.signInWithOAuth(provider: provider)
        } catch is CancellationError {
            // User dismissed the OAuth browser sheet.
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func submitForm() async {
        errorMessage = nil
        isSubmitting = true
        defer { isSubmitting = false }

        do {
            switch mode {
            case .signIn:
                try await Clerk.shared.auth.signInWithPassword(identifier: email, password: password)
            case .signUp:
                let signUp = try await Clerk.shared.auth.signUp(emailAddress: email, password: password)
                if signUp.status == .complete {
                    return
                }
                pendingSignUp = try await signUp.sendEmailCode()
                step = .verifyEmailCode
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func submitCode() async {
        guard let pendingSignUp else { return }
        errorMessage = nil
        isSubmitting = true
        defer { isSubmitting = false }

        do {
            let result = try await pendingSignUp.verifyEmailCode(code)
            if result.status != .complete {
                errorMessage = "Verification incomplete. Please try again."
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    AuthView()
}
