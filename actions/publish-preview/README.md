# publish-preview

Gives a pull request a link people can click. It copies the built site into
`OMEGA-HKUSTGZ/preview` under `<name>/`, which GitHub Pages serves at
`https://omega-hkustgz.github.io/preview/<name>/`, and posts that link on the pull request
(one comment, updated in place). The preview repository is separate from every official site,
so nothing live changes. With `mode: remove` it deletes the directory again.

| Input | Required | Default | Meaning |
| --- | --- | --- | --- |
| `name` | yes | | Preview directory: lowercase letters, digits, hyphens. Use `<site>-pr-<number>`. |
| `mode` | no | `publish` | `publish` or `remove`. |
| `publish-dir` | no | `./dist` | Built site directory. It must be built for the base path `/preview/<name>/` and must not ask search engines to index it. |
| `deploy-key` | no | | `secrets.PREVIEW_DEPLOY_KEY`. Without it the step warns and succeeds. |
| `comment` | no | `true` | Post the link on the pull request (the job needs `pull-requests: write`). |

Output `url` is the preview address.

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, closed]

permissions:
  contents: read
  pull-requests: write

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        if: github.event.action != 'closed'
      # ...build into ./dist with base path /preview/site-pr-<number>/...
      - uses: OMEGA-HKUSTGZ/.github/actions/publish-preview@main
        with:
          mode: ${{ github.event.action == 'closed' && 'remove' || 'publish' }}
          name: site-pr-${{ github.event.number }}
          deploy-key: ${{ secrets.PREVIEW_DEPLOY_KEY }}
```

Each source repository has its own deploy key on the preview repository, so one can be revoked
without touching the others. `publish-preview.sh` does the work and `test.sh` tests it against a
local repository.
