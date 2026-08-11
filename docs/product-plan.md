# Product plan

## Product promise

Folder Intelligence should make a large Markdown vault understandable without replacing Obsidian or locking data into a proprietary format.

A folder dashboard answers five questions:

1. What is this folder for?
2. What is in it?
3. What changed recently?
4. What is unresolved?
5. Where should I look next?

## Product boundaries

- Markdown files remain the source of truth.
- Folder dashboards summarize direct notes and child-dashboard summaries. This avoids repeatedly sending an entire recursive tree.
- AI may propose organization but may not silently move, rename, delete, retag, or rewrite notes.
- The plugin owns only marked dashboard regions.
- A folder-level source fingerprint controls freshness and prevents unchanged repeat requests.
- No account, sync service, telemetry, or hosted backend is required.

## Dashboard lifecycle

1. A dashboard is created as `{folder}/{folder}.md` unless the user changes the template.
2. Its deterministic index updates locally after a debounce.
3. Eligible note content and child briefs produce a source fingerprint.
4. When the fingerprint differs from recorded provenance, the AI brief becomes stale.
5. Opening a stale dashboard may refresh it once, depending on settings.
6. A generated brief is written with provider, model, time, fingerprint, and exclusion counts.
7. Folder renames move only dashboards that carry the plugin-owned marker.

## Release slices

### 0.1 — Trustworthy dashboards

- Dashboard creation and vault initialization.
- Local folder indexes.
- Managed-region updates.
- Stale/fresh state.
- Direct-note plus child-dashboard hierarchy.
- Sensitive-note and path exclusions.
- OpenAI, Anthropic, Gemini, DeepSeek, xAI, and custom providers.
- Session-only API keys and explicit saved-key warning.
- Source fingerprints, concurrency protection, and input ceilings.
- Folder rename support.

### 0.2 — Provider profiles and cost control

- Multiple named provider profiles, such as Work, Personal, Local, and Cheap. ✅
- Assign a profile to a folder tree through frontmatter or settings rules. ✅
- Per-profile prompt and model choices. ✅
- Preflight input-size and estimated-cost display. ✅
- Daily request limits and monthly estimated-cost budgets. ✅
- A cancellable **Refresh subtree** action that processes changed leaves first and rolls their briefs upward with visible progress. ✅
- Large local indexes collapse into native Obsidian callouts. ✅
- Provider connection tests and model discovery where APIs expose it.
- Cached per-note briefs so a changed folder resends only changed notes.

### 0.3 — AI note briefs

- Right-click and command-palette note summarization. ✅
- Clean native Obsidian callouts without visible management comments. ✅
- Safe refresh and confirmed removal that preserve note content. ✅
- Per-note fingerprints, privacy checks, provider routing, estimates, and budgets. ✅
- Fresh note briefs reused as compact folder-summary inputs. ✅
- Note rename/delete record maintenance. ✅
- Opt-in folder and subtree batch note summarization.
- Non-invasive stale-state decoration in reading and live-preview modes.

### 0.4 — Organization review

- Inbox dashboard for uncategorized notes.
- Suggested destination folder, tags, properties, and related links.
- Duplicate and near-duplicate detection.
- A review queue with accept, edit, skip, and undo.
- Bulk actions remain previewable and recoverable.
- Optional local embeddings; no cloud requirement.

### 0.5 — Daily knowledge workflow

- Cross-folder home dashboard.
- Recent changes and resurfacing views.
- Open-loop and action-item rollups.
- Dashboard templates by folder type: project, area, research, meetings, archive.
- Folder health indicators: stale material, orphan notes, missing summaries, and conflicting facts.
- Import transcript files and convert them into linked meeting notes.

### 1.0 — Community release

- Guided first-run onboarding and safe disposable-vault tutorial.
- Mobile behavior and large-vault performance validation.
- Accessibility and keyboard navigation review.
- Settings migration tests and corrupted-dashboard repair flow.
- Localization-ready strings.
- Reproducible signed GitHub releases and Obsidian community-directory submission.
- Public security and privacy review.

## Deliberately separate work

Capturing Teams system audio and speaker diarization is a desktop recorder product, not a normal cross-platform knowledge plugin permission. Folder Intelligence should first ingest transcript or meeting-note files. A future desktop companion can capture audio and write portable Markdown into the vault without forcing microphone/system-audio permissions on every plugin user.

## Risks to test early

- Dashboard update loops caused by filesystem events.
- Folder rename collisions with an existing folder note.
- Very large notes and vaults with thousands of folders.
- Prompt injection embedded in arbitrary note text.
- Provider API changes and retired model aliases.
- API keys leaking through vault sync, backups, logs, or support exports.
- Users editing or deleting one side of a managed marker pair.
- AI summaries presenting inferred tasks as explicit commitments.
