# Project page template

One static page per research project, in the OMEGA Lab style, published by `omega-lab-site`
at `https://omega-hkustgz.github.io/projects/<slug>/`. The template is the generic part of
[`unit-page`](https://github.com/OMEGA-HKUSTGZ/unit-page): layout, styles, the figure viewer,
the check, `AGENTS.md` and the workflow. A new page fills in content and media, nothing else.

## Start a page

```sh
git clone git@github.com:OMEGA-HKUSTGZ/.github.git omega-shared
node omega-shared/templates/project-page/new-page.mjs lightvln-page --slug lightvln --title "LightVLN"
cd lightvln-page
node tools/check.mjs     # lists every placeholder still to fill
node tools/serve.mjs     # look at it locally
```

1. Fill in `index.html` from the public paper and released material. Sections with nothing
   to show (usually Demos) are deleted, not left with placeholders.
2. Put figures and clips in `assets/media/`, and write where each came from in `README.md`.
3. Create the repository `OMEGA-HKUSTGZ/<slug>-page` (public), push, and open a pull request.
   The pull request gets a preview link once the repository has its `PREVIEW_DEPLOY_KEY`
   (`bash scripts/preview-key.sh <slug>-page`, run by an organisation owner; see
   [`actions/publish-preview`](../../actions/publish-preview)).
4. After the authors confirm, merge, then list the page in `omega-lab-site`'s
   `project-pages.json` with `"exclude": ["AGENTS.md", "tools"]`.

## What is in it

| Path in `site/` | What | Who edits it |
| --- | --- | --- |
| `index.html` | The page: header, title, authors, lead figure, overview, method, results, demos, citation | The page |
| `assets/media/` | Figures and clips | The page |
| `assets/css/page.css`, extra files in `assets/js/` | Anything only this page needs (UniT's point-cloud viewer is an example) | The page |
| `README.md`, `AGENTS.md`, `.github/workflows/page.yml` | Sources, rules for agents, the few-line workflow caller | The page (lightly) |
| `assets/css/omega-page.css`, `assets/js/omega-page.js`, `assets/fonts/`, `assets/brand/`, `tools/` | The shared look, figure viewer, check and local server | **Here only** |

Change a shared file here, then refresh each page with
`node omega-shared/templates/project-page/new-page.mjs <page-folder> --update`.

## What the check enforces

`node tools/check.mjs` is the page's one check command; CI runs the same. It rejects:

- template placeholders that were not filled in;
- a wrong or missing canonical address, title, description or link-preview image;
- links and media that do not exist, root-absolute paths, and scripts, styles or media loaded
  from another site;
- images without `alt`, `width` and `height`; tables outside their scroll wrapper;
- a video, or anything in the demos section, without a `data-evidence` label (`simulation`,
  `hil`, `real-world`, `animation`) and its matching visible tag;
- a file over 20 MiB or more than 50 MB of media (standard R7);
- scripts that do not parse.

## The workflow

`site/.github/workflows/page.yml` calls
[`.github/workflows/project-page.yml`](../../.github/workflows/project-page.yml): the check and
the repository-shape check on every push and pull request, a preview at
`https://omega-hkustgz.github.io/preview/<slug>-pr-<number>/` for pull requests (built by
[`scripts/project-page-preview.mjs`](../../scripts/project-page-preview.mjs): noindex, marked
as a draft, removed when the pull request closes), and a lab-site republish after a push to
`main`. A page whose large media are served from a media repository passes
`preview-exclude` with the same paths the lab site excludes for it, as `unit-page` does.

Tests: `node --test templates/project-page/test.mjs`.
