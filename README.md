# Baseball Pennant Simulator

## Overview
This project simulates a full baseball pennant race, providing tools to configure rosters, apply league rules, and view team performance through a browser-based interface. The codebase is structured into modular folders for the simulation engine, UI, rules, and supporting data, making it easy to extend or customize how games are run.

## Prerequisites
- Node.js 18 or later (for npm scripts and Jest tests)
- npm (bundled with Node.js)
- Optional: Python 3.8+ if you want to run the Playwright verification scripts.

## Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

## Running Tests
Execute the Jest suite:
```bash
npm test
```

## UI and Verification Scripts
- **Playwright roster verification**: `verify_roster.py` launches a Chromium session against `http://localhost:8000`, validates roster UI state, and saves a screenshot (`verification.png` or `error.png`).
- **Team selection sync check**: `verify_team_selection.py` ensures the "My Team" and "Team Management" dropdowns stay in sync while browsing the app.

Before running these scripts, start the web app locally on port 8000 (for example, `python -m http.server 8000` or any static file server) so the pages are available.

## Troubleshooting
- **Missing dependencies**: Delete `node_modules` and reinstall with `npm install`.
- **Jest cannot find modules**: Confirm you are using Node.js 18+ and that `npm install` completed without errors.
- **Playwright scripts fail to load the page**: Ensure the local server is running on port 8000 and that no other process is using that port.
- **UI selectors not found**: Clear browser cache or restart the Playwright script after refreshing your local build.

## Contribution Guidelines
- Fork the repository or create a feature branch from `main`.
- Keep changes focused and include tests when applicable (`npm test`).
- Run the Playwright verification scripts when modifying UI logic to catch regressions.
- Submit a pull request with a clear description of your changes and any testing performed.
