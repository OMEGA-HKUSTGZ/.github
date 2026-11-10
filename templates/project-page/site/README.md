# {{title}} — OMEGA Lab project page

Project page for **TODO: full paper title**, in the OMEGA Lab style.

- Paper: <https://arxiv.org/abs/TODO>
- Code: <https://github.com/TODO>
- Page: <https://omega-hkustgz.github.io/projects/{{slug}}/> (live once the lab site lists it)

## Working on the page

The page is `index.html` plus `assets/`; there is no build step. Rules for agents are in
[`AGENTS.md`](AGENTS.md).

```sh
node tools/check.mjs     # what CI runs
node tools/serve.mjs     # look at it locally
```

Every pull request gets a preview link, posted on the pull request. A push to `main` asks the
lab site to republish.

## Sources

Everything on the page comes from public material. Keep this list current.

| On the page | Source |
| --- | --- |
| Title, authors, affiliations, text | TODO: paper, version |
| Figures | TODO: which figures of the paper, how they were exported |
| Result tables and headline numbers | TODO: which tables |
| Demo clips | TODO: source and what each shows, or "none" |
