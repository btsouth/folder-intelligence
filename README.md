# Folder Intelligence

Folder Intelligence turns Obsidian folders into living dashboard notes. Every dashboard combines a local, always-current index with an optional AI brief that explains what the folder contains, what changed, and what still needs attention.

The plugin is local-first and useful without an API key. It never moves notes automatically, and it only edits clearly marked regions inside dashboard notes.

> [!IMPORTANT]
> This repository is an early alpha. Build and test it in a disposable vault before using it with important notes.

## What works now

- Create a folder-matching dashboard such as `Projects/Projects.md`.
- Initialize dashboards across an existing vault.
- Maintain direct-note and child-folder indexes after file changes.
- Mark AI summaries stale without making an API call on every edit.
- Refresh a stale summary when its dashboard opens, or work manually.
- Preserve user-authored note and dashboard content outside clearly identified generated sections.
- Follow plugin-owned dashboards across folder renames.
- Mark a note sensitive from the command palette.
- Build large vaults as hierarchical rollups: each dashboard reads direct notes and cached briefs from immediate child folders instead of sending an entire recursive tree in one request.
- Refresh an existing dashboard tree from the deepest changed folders upward, with preflight estimates, visible progress, cancellation, and no forced dashboard creation.
- Collapse very large note/folder indexes into native Obsidian callouts.
- Exclude paths and frontmatter properties from all AI context.
- Record provider, model, generation time, source fingerprint, and excluded-note count.
- Use OpenAI, Anthropic, Google Gemini, DeepSeek, xAI, or an OpenAI-compatible/local server.
- Create named profiles such as Work and Personal, route folder globs to them, and optionally override a dashboard with `folder-intelligence-profile` frontmatter.
- Preview request size and maximum estimated cost, then enforce per-profile daily request limits and monthly budgets locally.
- Keep each API key in memory for the current Obsidian session instead of saving it.
- Summarize any Markdown note into a clean native **AI note brief** callout at the top of the note.
- Refresh or remove a note brief from the note context menu or command palette.
- Reuse fresh note briefs in folder prompts instead of repeatedly resending full notes.

The default provider/model is OpenAI `gpt-5.6-luna`. Other provider defaults are Claude Haiku 4.5, Gemini 3.5 Flash-Lite, DeepSeek V4 Flash, and Grok 4.5. Every model ID and endpoint remains editable.

## Quick start

1. Install the plugin manually into a test vault using the instructions below.
2. Enable **Folder Intelligence** under **Settings → Community plugins**.
3. Right-click one folder and choose **Open folder dashboard**. Dashboards are created one folder at a time by default.
4. Optionally configure the Default profile and enter an API key under **Settings → Folder Intelligence**.
5. Right-click the folder and choose **Refresh AI folder brief**. Confirm the provider, input estimate, and maximum estimated cost.
6. For an existing hierarchy, choose **Refresh AI subtree…**. Missing dashboards remain untouched unless you explicitly enable their creation.

## AI note briefs

Right-click any Markdown note and choose **Summarize note with AI…**. After the same provider, token, and cost confirmation used by folder briefs, Folder Intelligence inserts a native Obsidian callout directly below YAML frontmatter:

```markdown
> [!abstract] AI note brief
> A concise summary of the note.
>
> **Key points**
>
> - Important detail
```

The exact callout is plugin-owned; refreshing replaces only that callout, while **Remove AI note brief…** removes it after confirmation. User-authored source content is never rewritten. Sensitive and excluded notes cannot be summarized.

Note briefs are manual by default. The plugin does not summarize a vault or folder automatically. When a brief is still current, folder summaries use it as a compact cached input; when its source note changes, the folder summarizer falls back to the full note until the brief is refreshed.

[Folder Notes](https://community.obsidian.md/plugins/folder-notes) is an optional companion. Because Folder Intelligence uses folder-matching note names by default, Folder Notes can make a normal click on a folder open its generated dashboard.

## Manual installation

Build the plugin, then copy these files into:

```text
<YourVault>/.obsidian/plugins/folder-intelligence/
```

Required files:

```text
main.js
manifest.json
styles.css
```

Restart Obsidian, then enable **Folder Intelligence** in Community plugins.

On Windows, after building, you can instead run:

```powershell
.\scripts\install-to-vault.ps1 -VaultPath 'C:\path\to\your\vault'
```

## Sensitive notes

A note is indexed locally but never sent to an AI provider when either condition is true:

- Its path matches a configured **Never send these paths to AI** glob.
- Any configured sensitive frontmatter property is true.

For example:

```yaml
---
sensitive: true
---
```

Sensitive notes appear with a lock icon in the local folder index. Their titles remain local and are not included in the AI prompt.

## Provider support

| Provider      | API style                          | Default model               |
| ------------- | ---------------------------------- | --------------------------- |
| OpenAI        | Responses                          | `gpt-5.6-luna`              |
| Anthropic     | Messages                           | `claude-haiku-4-5-20251001` |
| Google Gemini | Generate Content                   | `gemini-3.5-flash-lite`     |
| DeepSeek      | OpenAI-compatible Chat Completions | `deepseek-v4-flash`         |
| xAI           | OpenAI-compatible Chat Completions | `grok-4.5`                  |
| Custom/local  | Responses or Chat Completions      | User supplied               |

There is no provider fallback. A failed request stops and shows an error; the plugin never resends the notes to another company.

## Profiles and routing

The first matching route wins. Routes use vault-relative globs and a profile name:

```text
03 Work/** => Work
04 Personal/** => Personal
```

For a one-folder override, add the profile name to that dashboard's frontmatter:

```yaml
folder-intelligence-profile: Work
```

Prices are editable because provider pricing changes. A zero price means cost estimates are unavailable; request limits still apply. Usage records remain in the plugin's local `data.json` and are never sent as telemetry.

## Dashboard ownership

Folder Intelligence recognizes three managed sections headed **Dashboard status**, **AI folder brief**, and **Folder contents**, ending at **Your notes**. Older comment-marker dashboards migrate automatically when refreshed. Everything beneath **Your notes** is preserved.

Dashboard ownership and generation provenance are recorded in YAML frontmatter. If ownership cannot be established safely, the plugin refuses to edit the note.

## Development

```powershell
npm install
npm run dev
```

Validation:

```powershell
npm run format:check
npm run lint
npm test
npm run build
```

See [Product plan](docs/product-plan.md), [Privacy model](docs/privacy.md), and [Contributing](CONTRIBUTING.md).

## License

MIT
