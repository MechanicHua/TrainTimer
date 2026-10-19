# New desktop application

- `../docs/flutter-app-migration-plan-2026-10-18.md` is the accepted scope and phase order. Track evidence in `docs/implementation-status.md`; never mark hardware or profile acceptance from unit tests.
- All development outputs stay within this directory or its explicitly temporary artifacts. The parent web/Node/macOS launcher is frozen and read only. Never run the parent browser bundle/sync scripts.
- Dart owns business state. Protocols, transport, database, rendering and widgets have separate ownership. The timer uses a monotonic clock; rendering cannot determine solve time.
- Keep queues, logs, history pages and caches bounded. Load evidence separately from summaries. Never turn a full-state packet into a claim of complete move history.
- Invalid state, stale results, interrupted attempts and failed saves must have explicit outcomes. Preserve unsaved evidence and use stable IDs across retries.
- No filters, tag editing, formula library or training UI. Imported tags belong only to compatibility fields when transfer is implemented.
- The native solver is pinned and patched. Returned algorithms require independent state verification and at most 20 HTM. Preserve upstream GPL notices.
- Run `tool/check.sh` with the pinned SDK before delivery. Use actual Profile/Release measurements for performance claims; keep Windows and ARM device status separate.
