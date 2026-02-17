## 1. Dependency Alignment

- [x] 1.1 Replace `@nicolo-ribaudo/ghostty-web` with `ghostty-web` in `package.json`
- [x] 1.2 Refresh lockfile to reflect the new dependency source
- [x] 1.3 Confirm lockfile diff is bounded to rename-related entries; split unrelated churn into a separate change

## 2. Import and Type Wiring

- [x] 2.1 Update `TerminalView` imports/types to reference `ghostty-web`
- [x] 2.2 Update ambient module declaration file to `declare module "ghostty-web"`
- [x] 2.3 Search for and replace remaining `@nicolo-ribaudo/ghostty-web` references

## 3. Verification

- [x] 3.1 Run typecheck
- [x] 3.2 Run build
- [x] 3.3 Verify active-session terminal mount (no initialization error)
- [x] 3.4 Verify PTY output path (`ws.onmessage` -> `term.write`) in active session
- [x] 3.5 Verify stdin path (`term.onData` -> `ws.send`) in active session
- [ ] 3.6 Verify resize path (local `term.resize` and `POST /api/tasks/:id/terminal/resize`)
- [x] 3.7 Verify done/failed session replay view still renders terminal output
- [x] 3.8 Verify done/failed session remains non-interactive (stdin forwarding disabled)
