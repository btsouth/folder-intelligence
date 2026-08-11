# Folder Intelligence development guide

Folder Intelligence is a privacy-aware Obsidian community plugin that creates living dashboard notes for folders.

## Product invariants

- Ordinary Markdown remains useful without this plugin or any AI provider.
- Never overwrite user-authored content. The plugin owns only explicitly marked managed regions.
- Never send notes marked sensitive or excluded paths to an AI provider.
- AI is optional. Indexes, freshness state, and navigation work entirely locally.
- Never move, rename, or delete user notes without an explicit user action and confirmation.
- Every generated summary records its provider, model, time, and source fingerprint.
- Avoid an API request when the source fingerprint has not changed.
- Folder changes may mark summaries stale, but must not trigger an API call on every keystroke.

## Repository safety

This is a public repository. Never commit real vaults, notes, API keys, plugin `data.json`, transcripts, attachments, recordings, or private fixtures.

## Validation

```powershell
npm run format:check
npm run lint
npm test
npm run build
```
