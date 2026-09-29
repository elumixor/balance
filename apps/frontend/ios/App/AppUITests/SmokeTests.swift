import XCTest

/// Drives the real app on the fixture week (`-fixtures`): no account, no network, no calendar.
///
/// These are smoke tests — each walks one thing a person does every day through the whole app,
/// from a keystroke to what lands on screen — rather than a net over every branch; the rules
/// themselves are tested in `BalanceKit/Tests/BalanceCoreTests`.
final class SmokeTests: XCTestCase {
    var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-fixtures", "-AppleLanguages", "(en)", "-AppleLocale", "en_GB"]
        app.launch()
    }

    /// What the screen looked like when a test failed, kept in the result bundle.
    override func tearDown() {
        if testRun?.hasSucceeded == false {
            let shot = XCTAttachment(screenshot: app.screenshot())
            shot.lifetime = .keepAlways
            add(shot)
        }
        super.tearDown()
    }

    private func element(_ identifier: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: identifier).firstMatch
    }

    private var field: XCUIElement { app.textViews["lineField"].firstMatch }

    func testTodayListShowsTheWeek() {
        XCTAssertTrue(element("event-Standup").waitForExistence(timeout: 10))
        XCTAssertTrue(element("event-Gym").exists)
        XCTAssertTrue(element("task-Write the combat notes").exists)
        XCTAssertTrue(element("section-today").exists)
        XCTAssertTrue(element("section-tomorrow").exists)
    }

    func testTypingALineMakesAnEvent() {
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("Pitch rehearsal tomorrow 15:00 45m #work")
        XCTAssertTrue(element("linePreview").waitForExistence(timeout: 3))
        field.typeText("\n")
        XCTAssertTrue(element("event-Pitch rehearsal").waitForExistence(timeout: 5))
    }

    func testTypingALineMakesATaskAndTickingItOff() {
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("Buy paint @home\n")
        XCTAssertTrue(element("task-Buy paint").waitForExistence(timeout: 5))
        let check = element("check-Buy paint")
        XCTAssertTrue(check.exists)
        check.tap()
        XCTAssertTrue(app.buttons["Mark not done"].waitForExistence(timeout: 3))
    }

    func testSuggestionsCompleteASphere() {
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("Stretch 20:00 #hea")
        let suggestion = element("suggestion-Health")
        XCTAssertTrue(suggestion.waitForExistence(timeout: 3))
        suggestion.tap()
        XCTAssertEqual(field.value as? String, "Stretch 20:00 #Health ")
    }

    func testRetypingARowChangesTheEvent() {
        let row = element("event-Gym")
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        row.tap()
        let editor = field
        XCTAssertTrue(editor.waitForExistence(timeout: 3))
        XCTAssertTrue((editor.value as? String ?? "").hasPrefix("Gym "))
        editor.typeText(" late\n")
        XCTAssertTrue(element("event-Gym late").waitForExistence(timeout: 5))
    }

    func testCalendarBlockOpensItsCard() {
        app.tabBars.buttons["Calendar"].tap()
        let block = element("block-Standup")
        XCTAssertTrue(block.waitForExistence(timeout: 10))
        block.tap()
        let title = app.textFields["eventTitle"].firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        XCTAssertEqual(title.value as? String, "Standup")
        XCTAssertTrue(element("sphere-Health").exists)
        element("sphere-Health").tap()
        element("closeEvent").tap()
        XCTAssertFalse(title.waitForExistence(timeout: 1))
    }

    func testNewBlockFromTheCalendar() {
        app.tabBars.buttons["Calendar"].tap()
        let plus = element("newEventButton")
        XCTAssertTrue(plus.waitForExistence(timeout: 10))
        plus.tap()
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.typeText("Team sync 30m")
        element("quickAdd").tap()
        XCTAssertTrue(element("block-Team sync").waitForExistence(timeout: 5))
    }

    func testDeletingFromTheCard() {
        app.tabBars.buttons["Calendar"].tap()
        let block = element("block-Focus block")
        XCTAssertTrue(block.waitForExistence(timeout: 10))
        block.tap()
        let delete = element("deleteEvent")
        XCTAssertTrue(app.textFields["eventTitle"].waitForExistence(timeout: 5))
        var swipes = 0
        while !delete.isHittable && swipes < 6 {
            app.swipeUp()
            swipes += 1
        }
        delete.tap()
        app.buttons["Delete"].firstMatch.tap()
        XCTAssertTrue(block.waitForNonExistence(timeout: 5))
    }

    func testBalanceShowsTheRing() {
        app.tabBars.buttons["Balance"].tap()
        XCTAssertTrue(app.staticTexts["This week"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Deep work"].waitForExistence(timeout: 5))
    }

    func testSettingsOpenAndClose() {
        element("settingsButton").tap()
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 5))
        element("settingsDone").tap()
    }

    func testReviewThenPlanTheNextDay() {
        let nudge = element("sessionNudge")
        XCTAssertTrue(nudge.waitForExistence(timeout: 10))
        nudge.tap()
        let plan = element("planButton")
        XCTAssertTrue(plan.waitForExistence(timeout: 5))
        plan.tap()
        let commit = element("commitPlan")
        XCTAssertTrue(commit.waitForExistence(timeout: 5))
        XCTAssertTrue(commit.isEnabled)
        commit.tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label ENDSWITH 'is planned'")).firstMatch.waitForExistence(timeout: 5))
    }
}
