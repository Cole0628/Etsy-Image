# Runtime Log Export Design

## Goal

Add a user-facing diagnostic export that makes it possible to determine whether repeated or mismatched generated images originate in the local application or in the upstream KIE task service.

The feature must be safe for non-technical users: logging failures must never block image generation, logs must remain bounded, and exported data must not contain credentials or signed image URLs.

## Selected approach

Use server-side structured rolling logs and export them as a JSON diagnostic bundle from the existing Network Diagnostics page.

Alternatives rejected:

- Exporting only the generation database does not capture the boundary between local requests and KIE responses.
- Capturing raw requests and responses creates excessive noise and an unacceptable risk of exposing credentials or signed URLs.

## Storage and rotation

- Store newline-delimited JSON events under `data/runtime-logs/` in development and under the configured `KIE_WORKBENCH_DATA_DIR` data directory in packaged builds.
- Keep the active file at approximately 2 MB maximum.
- Retain the active file plus two rotated files.
- Log writes and rotation are best-effort. File-system errors are contained and never fail the associated image request.
- Corrupt or partially written lines are skipped during export and reported in bundle metadata.

## Event coverage

Record structured events at these server-side boundaries:

1. A generation request has been accepted and normalized.
2. Input image preparation has completed or failed.
3. A KIE task creation request is about to be sent.
4. KIE task creation has returned or failed.
5. A KIE task result query is about to be sent.
6. KIE task result data has returned or failed.
7. Local expected task data has been compared with the upstream response.

Each relevant event contains:

- Timestamp and event name.
- Application version.
- Local generation ID, batch ID and batch index when available.
- Requested and returned task IDs.
- Model, aspect ratio and resolution.
- Full prompt text, as explicitly requested by the product owner.
- Safe image references containing only host, filename and a deterministic fingerprint.
- Result image fingerprints.
- Upstream state, error summary and elapsed time when available.

## Privacy and sanitization

- Never record the KIE API key, `Authorization`, cookies, access tokens or request headers containing credentials.
- Never record complete input or result image URLs.
- Safe image references retain only the hostname, decoded filename when available, and a SHA-256 fingerprint of the complete URL.
- URL query strings and signed parameters are never exported as readable text.
- Recursive sanitization removes known credential-shaped keys before any upstream error or response details are persisted.
- The export UI warns that the bundle contains complete prompt text and should be reviewed before forwarding.

## Integrity detection

When task results are queried, compare the locally stored generation with the KIE response and emit explicit findings for:

- Requested task ID differs from the returned task ID.
- Returned model differs from the expected model.
- Returned prompt differs from the complete prompt sent for that task.
- Returned input image fingerprints differ from the expected input image fingerprints.
- A task ID is reused within the recent retained history.
- A result image fingerprint is reused by another recent task.
- Multiple tasks in one batch return the same task ID or result image fingerprint.

Findings are included both on their source event and in the export bundle's anomaly summary.

## Export API and UI

- Add a force-dynamic server endpoint under `/api/settings/logs/export`.
- Return a timestamped JSON attachment with `Cache-Control: no-store`.
- The bundle includes export time, app/runtime/platform metadata, log health metadata, structured events and aggregated anomaly findings.
- Export still succeeds when there are no events and states that no runtime records are available.
- Add an `导出运行日志` action to the existing Network Diagnostics page.
- The browser downloads the response directly and reports a useful error if export fails.

## Error handling

- Logging and export parsing tolerate missing directories, unavailable files, malformed lines and interrupted rotation.
- Logging helpers never throw into generation routes.
- Export endpoint failures return a safe error response without file-system paths, credentials or raw signed URLs.
- Instrumentation does not change the success or failure semantics of existing KIE requests.

## Verification

Use test-driven development for the logging module and route integration. Tests cover:

- Stable URL and text fingerprints.
- Full prompt preservation.
- Recursive secret and URL sanitization.
- Safe image reference formatting.
- Size-bounded rotation and retention.
- Malformed-line handling.
- Task, prompt, input and result reuse anomaly detection.
- Diagnostic bundle construction and empty-log behavior.
- Export response headers and download UI states where practical.

Run the complete Node test suite and a production Next.js build after implementation. The implementation must work with both the normal project data directory and packaged `KIE_WORKBENCH_DATA_DIR` layout.
