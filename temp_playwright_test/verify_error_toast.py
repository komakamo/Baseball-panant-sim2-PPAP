import asyncio
from playwright.async_api import async_playwright
import os

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        html_file_path = os.path.abspath('index.html')
        await page.goto(f'file://{html_file_path}')

        await page.wait_for_load_state('networkidle')

        # Add a delay to ensure everything is loaded
        await asyncio.sleep(2)

        # Dispatch a click event on the button that triggers an error
        await page.evaluate("() => document.getElementById('error-trigger-btn').click()")

        try:
            # Wait for the error toast to appear
            await page.wait_for_selector('.toast.visible.error', timeout=5000)
            print("Error toast notification appeared successfully.")
            await page.screenshot(path='screenshot_error_toast.png')
        except Exception as e:
            print(f"Error toast notification did not appear: {e}")
            await page.screenshot(path='screenshot_error_toast_not_found.png')

        await browser.close()

asyncio.run(main())
