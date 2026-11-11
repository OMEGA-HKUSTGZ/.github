#!/usr/bin/env bash
# Give source repositories their preview deploy key (standard R12), so their pull requests
# get a preview link from actions/publish-preview.
#
#   bash scripts/preview-key.sh <repository> [<repository> ...]     names inside OMEGA-HKUSTGZ
#   bash scripts/preview-key.sh lira-page plan-s-page
#
# For each repository: makes an ed25519 key pair in a temporary folder, adds the public half to
# OMEGA-HKUSTGZ/preview as a deploy key with write access titled "<repository> previews", stores
# the private half as that repository's secret PREVIEW_DEPLOY_KEY, deletes the local copy, and
# re-runs the latest check of each open pull request so the preview appears.
#
# This creates a credential, so a person with admin rights on both repositories runs it, then
# adds one row per key to the ledger in STANDARD.md (standard R6). Safe to run again: a
# repository that already has the secret is left alone. Each key can write to the preview
# repository only.
set -euo pipefail
ORG=OMEGA-HKUSTGZ
PREVIEW=$ORG/preview
[ $# -gt 0 ] || { sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
d=$(mktemp -d); trap 'rm -rf "$d"' EXIT
titles=$(gh repo deploy-key list --repo "$PREVIEW" --json title --jq '.[].title')
for r in "$@"; do
  r=${r#"$ORG/"}
  # Read the list first: with pipefail, a grep that stops early could make an existing secret look absent.
  secrets=$(gh secret list --repo "$ORG/$r" --json name --jq '.[].name')
  if grep -qx PREVIEW_DEPLOY_KEY <<<"$secrets"; then
    echo "$r: already has PREVIEW_DEPLOY_KEY"
  elif grep -qxF "$r previews" <<<"$titles"; then
    # A key without its secret: nobody holds the private half. Remove it by hand, then run again.
    echo "$r: $PREVIEW already has a deploy key titled \"$r previews\" but the repository has no secret; delete that key first" >&2
    exit 1
  else
    ssh-keygen -q -t ed25519 -N '' -C "$r previews" -f "$d/$r"
    gh repo deploy-key add "$d/$r.pub" --repo "$PREVIEW" --allow-write --title "$r previews"
    gh secret set PREVIEW_DEPLOY_KEY --repo "$ORG/$r" < "$d/$r"
    rm -f "$d/$r" "$d/$r.pub"
    echo "$r: key created"
  fi
  # The preview step of earlier runs only warned; run each open pull request's check again.
  branches=$(gh pr list --repo "$ORG/$r" --state open --json headRefName --jq '.[].headRefName')
  for branch in $branches; do
    run=$(gh run list --repo "$ORG/$r" --branch "$branch" --event pull_request --limit 1 --json databaseId,status --jq '.[0] | select(.status == "completed") | .databaseId')
    if [ -n "$run" ]; then
      if gh run rerun "$run" --repo "$ORG/$r"; then echo "$r: re-running the check of $branch"; else echo "$r: could not re-run the check of $branch; re-run it from the pull request" >&2; fi
    fi
  done
done
