import BalanceKit
import SafariServices
import SwiftUI

struct SettingsScreen: View {
    @Environment(Store.self) private var store
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var calendars: CalendarsResponse?
    @State private var connecting = false
    @State private var connectURL: URL?

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    if let profile = store.profile {
                        LabeledContent("Name", value: profile.name.isEmpty ? "—" : profile.name)
                        LabeledContent("Email", value: profile.email)
                    }
                    if session.mode == .live {
                        Button("Sign out", role: .destructive) {
                            Reminders.shared.clear()
                            dismiss()
                            Task { await session.signOut() }
                        }
                    } else {
                        LabeledContent("Mode", value: session.mode == .fixtures ? "Sample week" : "Development")
                    }
                }

                Section {
                    if let calendars {
                        ForEach(calendars.accounts) { account in
                            LabeledContent(account.email) {
                                if account.needsReconnect {
                                    Text("Expired").foregroundStyle(.red)
                                } else {
                                    Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                                }
                            }
                        }
                        if calendars.connected {
                            Picker("New events go to", selection: Binding(
                                get: { calendars.writeCalendarId },
                                set: { id in Task { await store.setWriteCalendar(id); await reload() } }
                            )) {
                                ForEach(calendars.accounts.flatMap(\.calendars).filter { !$0.readOnly }) { cal in
                                    Text(cal.name).tag(cal.id)
                                }
                            }
                        }
                    } else {
                        ProgressView()
                    }
                    Button {
                        Task { await connect() }
                    } label: {
                        HStack {
                            Label(calendars?.connected == true ? "Add another Google account" : "Connect Google Calendar", systemImage: "plus.circle")
                            if connecting { Spacer(); ProgressView() }
                        }
                    }
                    .disabled(connecting)
                } header: {
                    Text("Calendar")
                } footer: {
                    if calendars?.needsReconnect == true {
                        Text("Google asks for the connection again every week while the app is in testing. Reconnect to keep your calendar here.")
                    }
                }

                if HealthSync.shared.available {
                    Section {
                        Toggle("Read sleep from Health", isOn: Binding(
                            get: { HealthSync.shared.connected },
                            set: { on in
                                if on { Task { if await HealthSync.shared.connect() { await HealthSync.shared.sync(store) } } }
                                else { HealthSync.shared.disconnect() }
                            }
                        ))
                        if HealthSync.shared.connected {
                            Button {
                                Task { await HealthSync.shared.sync(store) }
                            } label: {
                                HStack {
                                    Text("Sync now")
                                    if HealthSync.shared.syncing { Spacer(); ProgressView() }
                                }
                            }
                        }
                    } header: {
                        Text("Apple Health")
                    } footer: {
                        Text("Link a sleep block to Health from its card; each night then lands where it was slept.")
                    }
                }

                Section("Reminders") {
                    LabeledContent("Remind me", value: store.preferences.reminders.enabled ? "\(store.preferences.reminders.leadMinutes) min before" : "Off")
                    LabeledContent("Use each event's own reminder", value: store.preferences.reminders.useCalendarReminders ? "Yes" : "No")
                }

                Section {
                    LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")
                    LabeledContent("Server", value: Session.apiBaseURL.host ?? "")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }.accessibilityIdentifier("settingsDone")
                }
            }
            .task { await reload() }
            .sheet(item: $connectURL) { url in
                SafariView(url: url).ignoresSafeArea()
            }
        }
    }

    private func reload() async {
        calendars = await store.calendars()
    }

    /// Opens Google's consent screen in a real browser — an embedded webview is refused — and
    /// watches for a new connected account, since the page it ends on doesn't come back here.
    private func connect() async {
        connecting = true
        defer { connecting = false }
        func valid() -> Set<String> { Set(calendars?.accounts.filter { !$0.needsReconnect }.map(\.accountId) ?? []) }
        let before = valid()
        do {
            connectURL = try await store.backend.googleConnectURL()
        } catch {
            store.report(error, "Couldn't start connecting")
            return
        }
        // A new account, or an expired one that works again, is what finishing looks like.
        for _ in 0..<60 {
            try? await Task.sleep(for: .seconds(2))
            let closed = connectURL == nil
            await reload()
            if !valid().subtracting(before).isEmpty {
                connectURL = nil
                await store.refresh()
                return
            }
            if closed { return }
        }
    }
}

extension URL: @retroactive Identifiable {
    public var id: String { absoluteString }
}

struct SafariView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
