#!/usr/bin/env bash
# Tests publish-preview.sh against a local bare repository. Run: bash actions/publish-preview/test.sh
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
script="$here/publish-preview.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }

git init -q --bare -b main "$work/preview.git"
git init -q -b main "$work/seed"
echo seed > "$work/seed/README.md"
git -C "$work/seed" add -A
git -C "$work/seed" -c user.name=t -c user.email=t@example.com commit -q -m seed
git -C "$work/seed" push -q "$work/preview.git" main

mkdir -p "$work/a/sub" "$work/b"
echo '<h1>a</h1>' > "$work/a/index.html"
echo x > "$work/a/sub/file.txt"
echo '<h1>b</h1>' > "$work/b/index.html"

run() { PREVIEW_GIT="$work/preview.git" MODE=$1 NAME=$2 PUBLISH_DIR=${3:-} bash "$script" >/dev/null; }
show() { git -C "$work/preview.git" show "main:$1" 2>/dev/null; }

run publish site-pr-1 "$work/a"
run publish unit-pr-2 "$work/b"
[ "$(show site-pr-1/sub/file.txt)" = x ] || fail "first preview not published"
[ "$(show unit-pr-2/index.html)" = '<h1>b</h1>' ] || fail "second preview not published"
[ "$(show README.md)" = seed ] || fail "unrelated file changed"
show index.html | grep -q 'href="site-pr-1/"' || fail "index does not list site-pr-1"
show index.html | grep -q 'noindex' || fail "index is not hidden from search"
show .nojekyll >/dev/null || fail ".nojekyll missing"

# Republishing replaces the directory instead of merging into it.
rm "$work/a/sub/file.txt"
run publish site-pr-1 "$work/a"
show site-pr-1/sub/file.txt >/dev/null && fail "stale file kept after republish"

# Publishing the same content again adds no commit.
before=$(git -C "$work/preview.git" rev-parse main)
run publish site-pr-1 "$work/a"
[ "$before" = "$(git -C "$work/preview.git" rev-parse main)" ] || fail "empty publish made a commit"

run remove site-pr-1
show site-pr-1/index.html >/dev/null && fail "preview not removed"
[ "$(show unit-pr-2/index.html)" = '<h1>b</h1>' ] || fail "remove touched another preview"
show index.html | grep -q 'site-pr-1' && fail "index still lists the removed preview"

for bad in '../x' 'Site' 'a/b' ''; do
  if PREVIEW_GIT="$work/preview.git" MODE=publish NAME="$bad" PUBLISH_DIR="$work/a" bash "$script" >/dev/null 2>&1; then
    fail "accepted bad name '$bad'"
  fi
done
mkdir "$work/empty"
if PREVIEW_GIT="$work/preview.git" MODE=publish NAME=ok PUBLISH_DIR="$work/empty" bash "$script" >/dev/null 2>&1; then
  fail "published a directory without index.html"
fi

echo "publish-preview: all checks passed"
