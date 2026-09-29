import BalanceCore
import SwiftUI
import UIKit

/// The typed line, with every word the reader understood drawn as what it means.
///
/// A `UITextView` rather than a `TextField`, because the recognised words are restyled in place as
/// they are typed — a day or a time in bold on a faint fill, a sphere in its own colour — without
/// the caret moving. Return submits instead of breaking the line; the line wraps when it is long.
struct TokenTextField: UIViewRepresentable {
    @Binding var text: String
    /// Where the caret is, in UTF-16 offsets, so the suggestion bar knows which word it is at.
    @Binding var caret: Int
    @Binding var focused: Bool
    var placeholder: String
    /// Bumped by the owner whenever it sets `text` itself — a picked suggestion, a cleared field.
    var revision: Int = 0
    var tokens: [TypedLine.Token]
    var tint: (TypedLine.Token) -> UIColor?
    var font: UIFont = .preferredFont(forTextStyle: .body)
    /// Handed what the view holds at that moment, not the last value SwiftUI rendered.
    var onSubmit: (String) -> Void
    var onEscape: (() -> Void)?

    func makeUIView(context: Context) -> LineTextView {
        let view = LineTextView()
        view.delegate = context.coordinator
        view.font = font
        view.adjustsFontForContentSizeCategory = true
        view.backgroundColor = .clear
        view.isScrollEnabled = false
        view.textContainerInset = UIEdgeInsets(top: 8, left: 0, bottom: 8, right: 0)
        view.textContainer.lineFragmentPadding = 0
        view.returnKeyType = .done
        view.enablesReturnKeyAutomatically = true
        view.smartDashesType = .no
        view.smartQuotesType = .no
        view.autocapitalizationType = .sentences
        view.placeholder = placeholder
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.accessibilityIdentifier = "lineField"
        view.onEscape = onEscape
        view.text = text
        context.coordinator.revision = revision
        return view
    }

    func updateUIView(_ view: LineTextView, context: Context) {
        context.coordinator.parent = self
        view.placeholder = placeholder
        view.onEscape = onEscape
        // Text only ever goes into the view when the owner says it changed it (`revision`):
        // SwiftUI also hands back values the view itself emitted a keystroke ago, and writing
        // one of those back would drop what was typed since.
        // A bumped revision can arrive a render before the text it goes with, so it is only
        // taken as seen once the text has actually moved.
        if revision != context.coordinator.revision, view.text != text {
            context.coordinator.revision = revision
            view.text = text
            view.selectedRange = NSRange(location: (text as NSString).length, length: 0)
        }
        style(view)
        view.refreshPlaceholder()
        view.wantsFocus = focused
        if focused, !view.isFirstResponder {
            view.requestFocus()
        } else if !focused, view.isFirstResponder {
            DispatchQueue.main.async { view.resignFirstResponder() }
        }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: LineTextView, context: Context) -> CGSize? {
        let width = proposal.width ?? UIScreen.main.bounds.width
        let size = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: width, height: max(size.height, font.lineHeight + 16))
    }

    /// Restyles the whole line without replacing it, so neither the caret nor the keyboard's
    /// own suggestions are disturbed. A word still being composed (marked text) is left alone.
    private func style(_ view: LineTextView) {
        guard view.markedTextRange == nil else { return }
        let storage = view.textStorage
        let full = NSRange(location: 0, length: storage.length)
        storage.beginEditing()
        storage.setAttributes([.font: font, .foregroundColor: UIColor.label], range: full)
        for token in tokens where NSMaxRange(token.range) <= storage.length {
            var attributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: font.pointSize, weight: .semibold),
            ]
            if let color = tint(token) {
                attributes[.foregroundColor] = color
            } else {
                attributes[.foregroundColor] = UIColor.label
                attributes[.backgroundColor] = UIColor.tertiarySystemFill
            }
            storage.addAttributes(attributes, range: token.range)
        }
        storage.endEditing()
        view.typingAttributes = [.font: font, .foregroundColor: UIColor.label]
    }

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: TokenTextField
        init(parent: TokenTextField) { self.parent = parent }

        func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
            if text == "\n" {
                parent.text = textView.text
                parent.onSubmit(textView.text)
                return false
            }
            return true
        }

        var revision = 0

        func textViewDidChange(_ textView: UITextView) {
            parent.text = textView.text
            parent.caret = textView.selectedRange.location
            (textView as? LineTextView)?.refreshPlaceholder()
        }

        func textViewDidChangeSelection(_ textView: UITextView) {
            let location = textView.selectedRange.location
            if parent.caret != location {
                DispatchQueue.main.async { self.parent.caret = location }
            }
        }

        func textViewDidBeginEditing(_ textView: UITextView) {
            if !parent.focused { DispatchQueue.main.async { self.parent.focused = true } }
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            if parent.focused { DispatchQueue.main.async { self.parent.focused = false } }
        }
    }
}

/// A text view that shows a placeholder and answers the hardware keyboard's Escape.
final class LineTextView: UITextView {
    var placeholder = "" {
        didSet { placeholderLabel.text = placeholder }
    }
    var onEscape: (() -> Void)?
    /// Asked to be focused before it was on screen; taken up the moment it is.
    var wantsFocus = false

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if wantsFocus { requestFocus() }
    }

    /// A view that has only just been put in a list row can refuse the keyboard for a frame or
    /// two while the row settles, so the ask is repeated briefly until it takes.
    func requestFocus(attempt: Int = 0) {
        guard wantsFocus, !isFirstResponder, attempt < 8 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + (attempt == 0 ? 0 : 0.06)) { [weak self] in
            guard let self, self.wantsFocus, !self.isFirstResponder else { return }
            if self.window == nil || !self.becomeFirstResponder() { self.requestFocus(attempt: attempt + 1) }
        }
    }

    private lazy var placeholderLabel: UILabel = {
        let label = UILabel()
        label.textColor = .placeholderText
        label.numberOfLines = 1
        label.adjustsFontForContentSizeCategory = true
        label.translatesAutoresizingMaskIntoConstraints = false
        addSubview(label)
        NSLayoutConstraint.activate([
            label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: textContainerInset.left),
            label.topAnchor.constraint(equalTo: topAnchor, constant: textContainerInset.top),
            label.widthAnchor.constraint(lessThanOrEqualTo: widthAnchor),
        ])
        return label
    }()

    func refreshPlaceholder() {
        placeholderLabel.font = font
        placeholderLabel.isHidden = !text.isEmpty
    }

    override var keyCommands: [UIKeyCommand]? {
        [UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(escape))]
    }

    @objc private func escape() { onEscape?() }
}
