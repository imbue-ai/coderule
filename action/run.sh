#!/usr/bin/env bash
set -euo pipefail

# Action runner for coderule GitHub Action.
# Computes merge base, runs coderule, and posts a PR review.

require_env() {
  local val="${!1:-}"
  if [ -z "$val" ]; then
    echo "::error::$1 environment variable not set"
    exit 1
  fi
  echo "$val"
}

compute_merge_base() {
  local base_ref="$1" head_sha="$2"
  git fetch --depth=50 origin "$base_ref" 2>/dev/null || true
  local merge_base
  merge_base="$(git merge-base "origin/${base_ref}" "$head_sha" 2>/dev/null)" || {
    echo "::error::Failed to compute merge base between origin/${base_ref} and ${head_sha}"
    exit 1
  }
  echo "$merge_base"
}

build_args() {
  local merge_base="$1"
  local args=("check" "--quiet" "--output-format" "github" "--base-commit" "$merge_base")

  if [ -n "${INPUT_MODEL:-}" ]; then
    args+=("--model" "$INPUT_MODEL")
  fi
  if [ -n "${INPUT_CONFIDENCE_THRESHOLD:-}" ]; then
    args+=("--confidence-threshold" "$INPUT_CONFIDENCE_THRESHOLD")
  fi
  if [ -n "${INPUT_MAX_WORKERS:-}" ]; then
    args+=("--max-workers" "$INPUT_MAX_WORKERS")
  fi
  if [ "${INPUT_AGENTIC:-}" = "true" ]; then
    args+=("--agentic")
  fi

  echo "${args[@]}"
}

post_review() {
  local review_json="$1" repo="$2" pr_number="$3" token="$4" head_sha="$5"

  # Inject commit_id into the review JSON
  review_json="$(echo "$review_json" | jq --arg sha "$head_sha" '. + {commit_id: $sha}')"

  local review_url="https://api.github.com/repos/${repo}/pulls/${pr_number}/reviews"
  local status_code

  # Try posting as a PR review (inline comments)
  status_code="$(
    curl -s -o /dev/null -w '%{http_code}' \
      -X POST "$review_url" \
      -H "Authorization: Bearer ${token}" \
      -H "Accept: application/vnd.github+json" \
      -H "Content-Type: application/json" \
      -d "$review_json"
  )"

  if [ "$status_code" = "200" ] || [ "$status_code" = "201" ]; then
    return 0
  fi

  echo "::warning::Review POST failed with status ${status_code}, falling back to issue comment"

  # Fallback: post as a plain PR comment
  local comment_url="https://api.github.com/repos/${repo}/issues/${pr_number}/comments"
  local body
  body="$(echo "$review_json" | jq -r '.body // ""')"

  # Append inline comments as markdown
  local inline
  inline="$(echo "$review_json" | jq -r '
    .comments // [] | .[] |
    "**\(.path):\(.line)**\n\n\(.body)"
  ')"

  if [ -n "$inline" ]; then
    body="${body}

---

${inline}"
  fi

  local comment_payload
  comment_payload="$(jq -n --arg body "$body" '{body: $body}')"

  status_code="$(
    curl -s -o /dev/null -w '%{http_code}' \
      -X POST "$comment_url" \
      -H "Authorization: Bearer ${token}" \
      -H "Accept: application/vnd.github+json" \
      -H "Content-Type: application/json" \
      -d "$comment_payload"
  )"

  if [ "$status_code" = "200" ] || [ "$status_code" = "201" ]; then
    return 0
  fi

  echo "::error::Failed to post review (status ${status_code}) and fallback comment (status ${status_code})"
  exit 1
}

run_check() {
  local merge_base="$1"
  local args
  read -r -a args <<< "$(build_args "$merge_base")"

  echo "Running: coderule ${args[*]}"

  # coderule writes JSON to stdout, status/error messages to stderr.
  # --quiet suppresses most stderr, but capture them separately to be safe.
  local stderr_file exit_code=0
  stderr_file="$(mktemp)"
  local output=""
  output="$(coderule "${args[@]}" 2>"$stderr_file")" || exit_code=$?

  # Exit code 0 = no violations, 1 = violations found, 2 = error
  if [ "$exit_code" -eq 2 ]; then
    echo "::error::coderule failed with exit code 2"
    cat "$stderr_file" >&2
    rm -f "$stderr_file"
    exit 1
  fi
  rm -f "$stderr_file"

  CODERULE_OUTPUT="$output"
  CODERULE_EXIT="$exit_code"
}

main() {
  local event_name="${INPUT_EVENT_NAME:-push}"
  local head_sha repo token fail_on_issues
  head_sha="$(require_env INPUT_HEAD_SHA)"
  repo="$(require_env GITHUB_REPOSITORY)"
  token="$(require_env GH_TOKEN)"
  fail_on_issues="${INPUT_FAIL_ON_ISSUES:-false}"

  if [ "$event_name" = "pull_request" ]; then
    # PR mode: compute merge base from PR refs, post review comments
    local base_ref pr_number
    base_ref="$(require_env INPUT_BASE_REF)"
    pr_number="$(require_env INPUT_PR_NUMBER)"

    local merge_base
    merge_base="$(compute_merge_base "$base_ref" "$head_sha")"
    echo "Merge base: ${merge_base}"

    run_check "$merge_base"

    if [ "$CODERULE_EXIT" -eq 0 ]; then
      echo "No violations found."
      exit 0
    fi

    echo "Violations found, posting review..."
    post_review "$CODERULE_OUTPUT" "$repo" "$pr_number" "$token" "$head_sha"
  else
    # Push mode: diff against HEAD~1, log output only (no PR to comment on)
    echo "Running coderule on push (results logged only, no PR comments)"
    run_check "HEAD~1"

    if [ "$CODERULE_EXIT" -eq 0 ]; then
      echo "No violations found."
      exit 0
    fi

    echo "$CODERULE_OUTPUT" | jq -r '.body // empty' 2>/dev/null || echo "$CODERULE_OUTPUT"
  fi

  if [ "$fail_on_issues" = "true" ]; then
    echo "::error::coderule found violations (fail-on-issues is enabled)"
    exit 1
  fi
}

main
