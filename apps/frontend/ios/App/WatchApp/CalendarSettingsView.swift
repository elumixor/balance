import SwiftUI
import BalanceKit

/// Picks the calendar that tracked sessions are written to. It is the one setting the watch needs
/// of its own: everything else about a calendar — connecting it, which ones are visible — belongs
/// to the phone, and this page never pretends otherwise.
struct CalendarSettingsView: View {
    @State private var response: CalendarsResponse?
    @State private var isLoading = true

    /// The two failures are kept apart on purpose. A list that never arrived is the whole screen —
    /// there is nothing else to show — while a calendar that refused to be picked is a footnote
    /// under a list the user is still in the middle of using, and replacing that list with an error
    /// page would take away the thing they were about to tap next.
    @State private var loadError: String?
    @State private var selectError: String?

    /// Shown as checked straight away so the tap registers, then reconciled with the server's
    /// answer when the write comes back.
    @State private var selectedId: String?
    @State private var savingId: String?

    var body: some View {
        List {
            if isLoading && response == nil {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else if response == nil, let loadError {
                failure(loadError)
            } else if let response, !response.connected {
                notice("Connect a calendar in Balance on your iPhone.")
            } else if let response, response.accounts.isEmpty {
                notice("No calendars found.")
            } else if let response {
                if let selectError {
                    Text(selectError)
                        .font(.caption2)
                        .foregroundStyle(.orange)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                }
                ForEach(response.accounts) { account in
                    Section(account.email) {
                        if account.needsReconnect {
                            Text("Reconnect this account on your iPhone.")
                                .font(.caption2)
                                .foregroundStyle(.orange)
                        }
                        ForEach(account.calendars) { calendar in
                            row(calendar, disabled: account.needsReconnect)
                        }
                    }
                }
            }

            Section {
                Text(Self.versionLabel)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle("Write to")
        .task { await load() }
        .refreshable { await load() }
    }

    private static var versionLabel: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "v\(version) (\(build))"
    }

    private func row(_ calendar: CalendarRef, disabled: Bool) -> some View {
        // A read-only calendar is listed rather than hidden, so the absence of a calendar someone
        // expects to see is never a mystery — it is visibly there and visibly unavailable.
        let unavailable = disabled || calendar.readOnly

        return Button {
            Task { await select(calendar.id) }
        } label: {
            HStack(spacing: 6) {
                Circle()
                    .fill(Color(hex: calendar.color ?? "#8e8e93"))
                    .frame(width: 8, height: 8)
                VStack(alignment: .leading, spacing: 1) {
                    Text(calendar.name)
                        .font(.footnote)
                        .lineLimit(2)
                    if calendar.readOnly {
                        Text("Read only")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 4)
                if savingId == calendar.id {
                    ProgressView().controlSize(.mini)
                } else if selectedId == calendar.id {
                    Image(systemName: "checkmark")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.tint)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(unavailable || savingId != nil)
        .opacity(unavailable ? 0.4 : 1)
    }

    private func notice(_ text: String) -> some View {
        Text(text)
            .font(.caption2)
            .multilineTextAlignment(.center)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity)
    }

    private func failure(_ message: String) -> some View {
        VStack(spacing: 6) {
            Text(message)
                .font(.caption2)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Button("Try again") { Task { await load() } }
                .font(.footnote)
        }
        .frame(maxWidth: .infinity)
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let fetched = try await APIClient.shared.fetchCalendars()
            response = fetched
            selectedId = fetched.writeCalendarId.isEmpty ? nil : fetched.writeCalendarId
            loadError = nil
            selectError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func select(_ id: String) async {
        guard id != selectedId else { return }
        let previous = selectedId
        selectedId = id
        savingId = id
        defer { savingId = nil }
        do {
            try await APIClient.shared.setWriteCalendar(id: id)
            selectError = nil
        } catch {
            selectedId = previous
            selectError = error.localizedDescription
        }
    }
}
