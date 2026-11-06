# publish-static-site

Pushes a built static site to a public artifact repository (for example
`OMEGA-HKUSTGZ/omega-hkustgz.github.io`) with `peaceiris/actions-gh-pages@v4` and a deploy key.
It is a composite action, so it runs in the caller's build job and the built directory never
moves between jobs.

| Input | Required | Default | Meaning |
| --- | --- | --- | --- |
| `deploy-key` | yes | | Private key of a deploy key with write access to the artifact repository, usually `secrets.PAGES_DEPLOY_KEY`. |
| `external-repository` | yes | | Artifact repository, as `owner/name`. |
| `commit-message` | yes | | Full message of the published commit, e.g. `Deploy ${{ github.repository }}@${{ github.sha }}`. |
| `publish-dir` | no | `./dist` | Built site directory. |
| `publish-branch` | no | `main` | Branch of the artifact repository. |

Fixed lab defaults: commits are made as `github-actions[bot]`, `.nojekyll` is added to
`publish-dir`, and history is kept (no `force_orphan`), since orphan pushes re-upload every file.

```yaml
- name: Publish
  if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'
  uses: OMEGA-HKUSTGZ/.github/actions/publish-static-site@main
  with:
    deploy-key: ${{ secrets.PAGES_DEPLOY_KEY }}
    external-repository: OMEGA-HKUSTGZ/omega-hkustgz.github.io
    commit-message: Deploy ${{ github.repository }}@${{ github.sha }}
```
