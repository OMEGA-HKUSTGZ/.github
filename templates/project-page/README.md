# Project page template

One static page per research project, in the OMEGA Lab style, published by `omega-lab-site`
at `https://omega-hkustgz.github.io/projects/<slug>/`. The template is the generic part of
[`unit-page`](https://github.com/OMEGA-HKUSTGZ/unit-page): layout, styles, the figure viewer,
the check, `AGENTS.md` and the workflow. A new page fills in content and media, nothing else.

## Start a page

New pages live in one repository, [`project-pages`](https://github.com/OMEGA-HKUSTGZ/project-pages),
one folder per page. The folder name is the slug.

```sh
git clone git@github.com:OMEGA-HKUSTGZ/.github.git omega-shared
git clone git@github.com:OMEGA-HKUSTGZ/project-pages.git && cd project-pages
git switch -c draft/lightvln
node ../omega-shared/templates/project-page/new-page.mjs lightvln --slug lightvln --title "LightVLN"
node tools/check.mjs     # lists every placeholder still to fill
node tools/serve.mjs     # look at it locally
```

1. Fill in `<slug>/index.html` from the public paper and released material. Sections with
   nothing to show (usually Demos) are deleted, not left with placeholders.
2. Put figures and clips in `<slug>/assets/media/`, and write where each came from in
   `<slug>/README.md`.
3. Push the branch and open a pull request. It gets a preview link at
   `https://omega-hkustgz.github.io/preview/project-pages-pr-<number>/<slug>/`.
4. After the authors confirm, merge, then list the page in `omega-lab-site`'s
   `project-pages.json`: `{ "slug": "<slug>", "repository": "OMEGA-HKUSTGZ/project-pages", "path": "<slug>" }`.

A page with its own tests or tooling (`unit-page`) can stay a repository of its own:
`new-page.mjs <folder> --slug … --title …` outside `project-pages` scaffolds the page together
with `tools/`, `AGENTS.md` and the workflow caller, and the lab site lists it with
`"exclude": ["AGENTS.md", "tools"]`. Its previews need the repository's own
`PREVIEW_DEPLOY_KEY` (`bash scripts/preview-key.sh <repository>`).

## What is in it

| Path in `site/` | What | Who edits it |
| --- | --- | --- |
| `index.html` | The page: header, title, authors, lead figure, overview, method, results, demos, citation | The page |
| `assets/media/` | Figures and clips | The page |
| `assets/css/page.css`, extra files in `assets/js/` | Anything only this page needs (UniT's point-cloud viewer is an example) | The page |
| `README.md`, `AGENTS.md`, `.github/workflows/page.yml` | Sources, rules for agents, the few-line workflow caller | The page (lightly) |
| `assets/css/omega-page.css`, `assets/js/omega-page.js`, `assets/fonts/`, `assets/brand/`, `tools/` | The shared look, figure viewer, check and local server | **Here only** |

In `project-pages` a page folder holds only the first three rows; `tools/`, `AGENTS.md` and
the workflow are the repository's.

Change a shared file here, then refresh with
`node omega-shared/templates/project-page/new-page.mjs <folder> --update`, where the folder
is the `project-pages` checkout (its tools and every page) or a page repository.

## What the check enforces

`node tools/check.mjs` is the one check command; CI runs the same. In `project-pages` it checks
every page and that each folder carries its own slug. It rejects:

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

`.github/workflows/page.yml` in the repository calls
[`.github/workflows/project-page.yml`](../../.github/workflows/project-page.yml): the check and
the repository-shape check on every push and pull request, a preview for pull requests (built
by [`scripts/project-page-preview.mjs`](../../scripts/project-page-preview.mjs): noindex,
marked as a draft, removed when the pull request closes), and a lab-site republish after a
push to `main`. `project-pages` calls it without a slug and gets one preview holding every
page, `…/preview/project-pages-pr-<number>/<slug>/`. A page repository passes its slug and gets
`…/preview/<slug>-pr-<number>/`; one whose large media are served from a media repository adds
`preview-exclude` with the same paths the lab site excludes for it, as `unit-page` does.

Tests: `node --test templates/project-page/test.mjs`.
