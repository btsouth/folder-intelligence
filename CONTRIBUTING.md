# Contributing

Thanks for helping improve Folder Intelligence.

## Before opening a change

- Test only with synthetic notes in a disposable vault.
- Never commit a real vault, API key, plugin `data.json`, transcript, recording, or private fixture.
- Preserve the invariants in `AGENTS.md`.
- Keep provider-specific code behind the common provider interface.
- Add a focused regression test for changes to managed regions, exclusions, fingerprints, or provider parsing.

## Validation

```powershell
npm install
npm run format:check
npm run lint
npm test
npm run build
```

## Pull requests

Explain the user-visible behavior, privacy implications, and how the change was tested. Avoid mixing unrelated refactors with behavior changes.
