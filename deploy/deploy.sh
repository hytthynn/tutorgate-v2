#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
release_id=${1:?release id required}
[[ "$release_id" =~ ^[0-9]+-[0-9]+-[a-f0-9]{40}$ ]] || exit 2
base="$HOME/tutorgate"
release="$base/releases/$release_id"
exec 9>"$base/deploy.lock"
flock -w 600 9
cd "$release"
chmod 600 runtime.env deploy.env
docker compose version
gzip -dc image.tar.gz | docker load
rm image.tar.gz
previous=$(readlink -f "$base/current" || true)
compose() { docker compose --project-name tutorgate --env-file "$1/deploy.env" -f "$1/compose.yml" "${@:2}"; }
rollback() {
  trap - ERR
  echo "Deployment failed; restoring previous release."
  if [[ -n "$previous" && "$previous" == "$base/releases/"* && -f "$previous/compose.yml" ]]; then
    compose "$previous" up -d --wait --wait-timeout 120 || echo "Rollback failed; inspect containers on the server."
  else
    compose "$release" down || true
  fi
  exit 1
}
trap rollback ERR
compose "$release" up -d --wait --wait-timeout 180
domain=$(sed -n 's/^APP_DOMAIN=//p' deploy.env)
curl --fail --silent --show-error --retry 12 --retry-all-errors --retry-delay 5 --max-time 15 "https://$domain/login" > /dev/null
ln -sfn "$release" "$base/current.new"
mv -Tf "$base/current.new" "$base/current"
trap - ERR
echo "Deployment ready: $release_id"
