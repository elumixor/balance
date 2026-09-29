import XCTest

/// Walks every screen once and keeps a screenshot of each in the result bundle — the pictures a
/// visual review is done from. On the fixture week by default; with `TEST_RUNNER_BALANCE_TOUR_LIVE=1`
/// in the environment of `xcodebuild test`, on the local backend's real account instead.
final class TourTests: XCTestCase {
    func testTour() {
        let app = XCUIApplication()
        // A live tour only looks: nothing it types is ever submitted to a real calendar.
        let live = ProcessInfo.processInfo.environment["BALANCE_TOUR_LIVE"] == "1"
        if live {
            app.launchEnvironment["BALANCE_DEV_AUTH"] = "1"
        } else {
            app.launchArguments = ["-fixtures"]
        }
        addUIInterruptionMonitor(withDescription: "Notifications") { alert in
            alert.buttons["Allow"].exists ? (alert.buttons["Allow"].tap(), true).1 : false
        }
        app.launch()
        func shot(_ name: String) {
            sleep(1)
            let attachment = XCTAttachment(screenshot: app.screenshot())
            attachment.name = name
            attachment.lifetime = .keepAlways
            add(attachment)
        }
        func element(_ id: String) -> XCUIElement { app.descendants(matching: .any).matching(identifier: id).firstMatch }

        _ = app.textViews["lineField"].waitForExistence(timeout: 15)
        sleep(2)
        // Lets the interruption monitor answer a permission prompt, tapping nothing that matters.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.03)).tap()
        shot("1-today")

        let field = app.textViews["lineField"].firstMatch
        field.tap()
        field.typeText("Gym tomorrow 7am 45m #hea")
        shot("2-typing")
        if element("suggestion-Health").exists { element("suggestion-Health").tap() }
        shot("3-suggested")
        if live {
            field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 40))
            field.typeText("\n")
        } else {
            field.typeText("\n")
        }
        app.collectionViews.firstMatch.swipeDown(velocity: .slow)

        app.tabBars.buttons["Calendar"].tap()
        shot("4-calendar")
        let block = app.descendants(matching: .any)
            .matching(NSPredicate(format: "identifier BEGINSWITH 'block-'")).allElementsBoundByIndex
            .first { $0.isHittable }
        if let block {
            block.tap()
            shot("5-card-medium")
            app.swipeUp()
            shot("6-card-large")
            element("closeEvent").tap()
        }
        element("modeMenu").tap()
        app.buttons["Week"].firstMatch.tap()
        shot("7-week")
        element("modeMenu").tap()
        app.buttons["3 Days"].firstMatch.tap()
        element("newEventButton").tap()
        _ = app.textViews["lineField"].waitForExistence(timeout: 3)
        app.textViews["lineField"].firstMatch.typeText("Deep work 2h #work")
        shot("8-quick-create")
        app.swipeDown()
        app.swipeDown()
        sleep(1)

        app.tabBars.buttons["Balance"].tap()
        shot("9-balance")
        app.tabBars.buttons["Today"].tap()
        element("settingsButton").tap()
        shot("10-settings")
    }
}
