But: README for config overrides

But: This file explains how to keep environment-specific configuration local and avoid git merge conflicts.

1) Ignored patterns
- The repository now ignores `config/*.local.json` and `config/*.secret.json` (see `.gitignore`).

2) Recommended workflow
- Keep canonical, shareable defaults in tracked files (e.g. `config/config.json.example`).
- Place environment-specific overrides in `config/config.local.json` (this file is ignored by git).
- Alternatively, set the environment variable `CONFIG_FILE` to point to an absolute path to a JSON file on the server.

3) If you have existing tracked config files you want to stop tracking on the repo:
- Run the helper script to remove them from the index (it will not delete the files):

  ./scripts/untrack-config.sh config/links.json config/seo.json

- Then commit the change:

  git add .gitignore
  git commit -m "Stop tracking local config files"
  git push

4) Server behavior after change
- `server/config.js` will look for configuration in this order:
  1. `CONFIG_FILE` env var (absolute path)
  2. `config/config.json` (tracked base)
  3. `config/config.local.json` (local override)
  4. `config/config.json.example` (fallback)
- Local overrides merge shallowly over base config so you can override only the keys you need.

5) Rollback
- If you need a file to be tracked again, run `git add <file>` and commit.

If you want, I can now run the untrack script for the currently tracked files (`config/links.json`, `config/seo.json`, `config/galleries.json`) and create the commit for you. Reply "run" to proceed or "skip" to do it yourself.