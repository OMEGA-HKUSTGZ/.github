#!/usr/bin/env bash
# Publish or remove one preview directory in the preview repository.
#
# Environment:
#   MODE         publish | remove
#   NAME         directory in the preview repository, e.g. site-pr-18
#   PUBLISH_DIR  built site to copy (publish only)
#   PREVIEW_GIT  git URL of the preview repository
#   BRANCH       branch to push to (default main)
#   DEPLOY_KEY   SSH private key with write access (optional for a local URL)
#   MESSAGE      commit message
#
# Other previews are left alone. A push that loses a race with another
# repository's preview is retried on top of the new head.
set -euo pipefail

MODE=${MODE:?}
NAME=${NAME:?}
PREVIEW_GIT=${PREVIEW_GIT:?}
BRANCH=${BRANCH:-main}
MESSAGE=${MESSAGE:-"$MODE $NAME"}

if ! [[ $NAME =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]]; then
  echo "::error::preview name '$NAME' must be lowercase letters, digits and hyphens" >&2
  exit 2
fi
case $MODE in
  publish)
    if [ ! -f "${PUBLISH_DIR:?}/index.html" ]; then
      echo "::error::$PUBLISH_DIR has no index.html" >&2
      exit 2
    fi
    ;;
  remove) ;;
  *)
    echo "::error::MODE must be publish or remove" >&2
    exit 2
    ;;
esac

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
if [ -n "${DEPLOY_KEY:-}" ]; then
  printf '%s\n' "$DEPLOY_KEY" > "$tmp/key"
  chmod 600 "$tmp/key"
  export GIT_SSH_COMMAND="ssh -i $tmp/key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
fi

# The landing page lists the previews that exist right now.
write_index() {
  local dir=$1 entry
  {
    printf '<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n'
    printf '<meta name="robots" content="noindex, nofollow">\n'
    printf '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    printf '<title>OMEGA previews</title>\n'
    printf '<style>body{font:16px/1.6 system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem}</style>\n'
    printf '<h1>OMEGA previews</h1>\n'
    printf '<p>Drafts under review. Nothing here is the official site.</p>\n<ul>\n'
    for entry in "$dir"/*/; do
      [ -d "$entry" ] || continue
      entry=$(basename "$entry")
      printf '<li><a href="%s/">%s</a></li>\n' "$entry" "$entry"
    done
    printf '</ul>\n</html>\n'
  } > "$dir/index.html"
}

for attempt in 1 2 3 4; do
  rm -rf "$tmp/repo"
  git clone -q --depth 1 --branch "$BRANCH" "$PREVIEW_GIT" "$tmp/repo"
  rm -rf "$tmp/repo/${NAME:?}"
  if [ "$MODE" = publish ]; then
    mkdir -p "$tmp/repo/$NAME"
    cp -R "$PUBLISH_DIR"/. "$tmp/repo/$NAME"/
    rm -rf "$tmp/repo/$NAME/.git"
  fi
  touch "$tmp/repo/.nojekyll"
  write_index "$tmp/repo"
  git -C "$tmp/repo" add -A
  if git -C "$tmp/repo" diff --cached --quiet; then
    echo "Nothing to change for $NAME."
    exit 0
  fi
  git -C "$tmp/repo" \
    -c user.name='github-actions[bot]' \
    -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
    commit -q -m "$MESSAGE"
  if git -C "$tmp/repo" push -q origin "HEAD:$BRANCH"; then
    echo "Preview $NAME: $MODE done."
    exit 0
  fi
  echo "Push rejected (attempt $attempt); retrying on the new head." >&2
  sleep $((attempt * 3))
done
echo "::error::could not push the preview after 4 attempts" >&2
exit 1
