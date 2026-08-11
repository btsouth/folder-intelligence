# Privacy model

## Local operations

The following operations do not contact any external service:

- Scanning folder and file names.
- Reading Markdown to calculate a source fingerprint.
- Creating or updating dashboard indexes.
- Detecting frontmatter exclusion properties.
- Marking summaries stale.
- Renaming a plugin-owned dashboard after its folder is renamed.
- Detecting, inserting, refreshing, or removing the local AI note-brief callout after an explicit action.

## AI operations

An external request occurs only when the user confirms a manual refresh, confirms a subtree refresh, or enables refresh-on-open and opens a stale dashboard.

Folder-summary requests contain:

- Bounded content from eligible direct notes.
- Existing briefs from eligible child-folder dashboards.
- Paths for eligible notes and child folders.
- The configured summary instructions.

Note-summary requests contain bounded content from only the selected eligible Markdown note plus the configured summary instructions.

The request does not contain:

- Content or titles from excluded notes.
- Attachments or non-Markdown files.
- Content outside the selected folder hierarchy.
- An entire vault by default.

## Provider isolation

Only the profile selected for that folder receives a request. Folder Intelligence has no automatic fallback and no hosted proxy. Requests go directly from Obsidian to the configured endpoint.

Before a manual request, the plugin displays an approximate input-token count and maximum estimated cost when pricing is configured. Daily request limits and monthly estimated budgets are checked locally before each call. The local usage ledger contains timestamps, profile/model identifiers, folder or note paths, character counts, token estimates, and estimated cost; it contains no note text and is never transmitted as telemetry.

Note-brief freshness records contain only the note path, source fingerprint, provider/profile identifiers, model, and generation time. They contain no note text. Renaming or deleting notes updates these local records.

## Credentials

Obsidian does not expose portable secure credential storage to ordinary community plugins. Folder Intelligence therefore defaults to a session-only key held in memory. If **Remember API key** is enabled, the key is written to the plugin's `data.json`, which may be included in vault sync and backups.

Never attach `data.json` to a bug report. It is excluded from this repository.

## Prompt injection

Notes are untrusted data. The system prompt explicitly prevents note text from changing the summarization task or requesting external actions. Source notes are serialized as data, and the provider receives no tools, web access, or permission to modify the vault.

Prompt injection defenses reduce risk but cannot guarantee perfect model behavior. Generated briefs are labeled and should be checked against source notes.

## Telemetry

Folder Intelligence currently sends no analytics, crash reports, or usage telemetry.
