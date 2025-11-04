
import asyncio
from playwright.async_api import async_playwright, expect
import re

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto("http://localhost:8000")

        # Give the app a second to fully initialize all event listeners
        await page.wait_for_timeout(1000)

        # Select a team from the "My Team" dropdown
        await page.select_option("#selUserTeam", "1")

        # Verify that the other dropdown has been updated
        await expect(page.locator("#selTeamManage")).to_have_value("1")

        # Select a different team from the "Team Management" dropdown
        await page.select_option("#selTeamManage", "3")

        # Verify that the "My Team" dropdown has been updated
        await expect(page.locator("#selUserTeam")).to_have_value("3")

        await page.screenshot(path="verification.png")
        await browser.close()

asyncio.run(main())
