# {{slug}}-page

Lab standard: <https://github.com/OMEGA-HKUSTGZ/.github-private/blob/main/STANDARD.md>

## 这是什么

Static project page for {{title}}, published by omega-lab-site at
`https://omega-hkustgz.github.io/projects/{{slug}}/`. Started from the lab's project-page
template: <https://github.com/OMEGA-HKUSTGZ/.github/tree/main/templates/project-page>.

## 写在哪里

- Content: `index.html`. Media: `assets/media/`. No build step.
- Styles and scripts only this page needs: `assets/css/page.css` and a new file in `assets/js/`.
- Do not edit the shared files here: `assets/css/omega-page.css`, `assets/js/omega-page.js`,
  `assets/fonts/`, `assets/brand/`, `tools/`. Change them in the template, then refresh with
  `node <.github checkout>/templates/project-page/new-page.mjs . --update`.
- Where each figure, number and clip comes from: `README.md`.

## 怎么检查

```sh
node tools/check.mjs
```

CI runs the same command. Look at the page with `node tools/serve.mjs` at desktop and phone
widths. A pull request gets a preview link at
`https://omega-hkustgz.github.io/preview/{{slug}}-pr-<number>/`.

## 坑

- Text, numbers and figures come from the public paper and released material. Copy numbers
  from the paper's source; do not round up, extrapolate or add claims.
- Every clip and photo of a run says what it is: `data-evidence` is `simulation`, `hil`,
  `real-world` or `animation`, with the matching visible tag. Simulated motion driven by real
  onboard hardware is `hil`, not `real-world`. No material, no section.
- Keep the page two levels deep: lab links are `../../`, everything else is a relative path.
- Leave `<meta name="robots" content="index, follow">`; previews are made noindex by CI.
- A file over 20 MiB, or over 50 MB of media in total, goes to a lab media repository.
- The page goes live only when omega-lab-site lists it in `project-pages.json`, after the
  authors confirm it.
