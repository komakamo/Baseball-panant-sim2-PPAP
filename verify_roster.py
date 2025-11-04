from playwright.sync_api import sync_playwright, expect
import time

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()

    # Listen for console errors
    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)

    try:
        page.goto("http://localhost:8000", timeout=10000)

        # Give the app a moment to initialize
        time.sleep(2)

        # Check for console errors after loading
        if errors:
            print("Console errors found on page load:")
            for error in errors:
                print(error)
            raise Exception("JavaScript errors on startup prevented verification.")

        # If no errors, proceed with verification
        expect(page.locator("#selTeamManage option")).not_to_have_count(0, timeout=5000)

        page.select_option("#selTeamManage", "0")
        page.click('button[data-tab="roster"]')
        roster_table = page.locator("#management-content table").first
        expect(roster_table).to_be_visible()

        foreign_player_rows = page.locator("tr:has(span.foreign-badge)")
        squad_select_to_change = None
        count = foreign_player_rows.count()
        for i in range(count):
            row = foreign_player_rows.nth(i)
            squad_select = row.locator("select.squad")
            if squad_select.evaluate("el => el.value") == "一軍":
                squad_select_to_change = squad_select
                break

        if squad_select_to_change:
            squad_select_to_change.select_option("二軍")
            page.wait_for_timeout(1000)

        page.screenshot(path="verification.png")
        print("Screenshot 'verification.png' taken successfully.")

    except Exception as e:
        print(f"An error occurred: {e}")
        page.screenshot(path="error.png")
        print("Error screenshot 'error.png' taken.")
        if errors:
            print("\nCaptured Console Errors:")
            for error in errors:
                print(error)
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
