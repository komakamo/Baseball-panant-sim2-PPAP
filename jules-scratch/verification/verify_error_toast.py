
import pytest
from playwright.sync_api import Page, expect, sync_playwright
import os

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Get the absolute path to the index.html file
        current_dir = os.getcwd()
        file_path = f"file://{current_dir}/index.html"

        page.goto(file_path)

        # Wait for the page to be fully loaded
        page.wait_for_load_state('load')

        # The debug helper script overwrites console.error
        # and window.onerror to call `addLog`. So I can trigger it by
        # throwing an error.
        error_message = "This is a test error for verification."
        page.evaluate(f"() => {{ setTimeout(() => {{ throw new Error('{error_message}'); }}, 100); }}")

        # Now, I need to wait for the toast to appear.
        # Based on index.html, the toast has a class `.toast` and is inside `.toast-container`
        toast_container = page.locator(".toast-container")

        # The toast itself should become visible and have the 'error' class
        toast = toast_container.locator(".toast.visible.error")

        # Wait for the toast to appear
        expect(toast).to_be_visible(timeout=5000)

        # Check the title and description
        toast_title = toast.locator(".toast-title")
        toast_desc = toast.locator(".toast-desc")

        expect(toast_title).to_have_text("エラーが発生しました")
        # The error message in the debug helper includes "Error: <message>"
        # We check if the description contains our test error message.
        expect(toast_desc).to_contain_text(error_message)

        # Take a screenshot
        page.screenshot(path="jules-scratch/verification/verification.png")

        browser.close()

if __name__ == "__main__":
    run_test()
