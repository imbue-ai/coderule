"""GitHub Action runner for coderule.

Runs coderule check, injects commit_id into the review payload,
and posts results as a PR review (with fallback to an issue comment).
"""

import json
import os
import subprocess
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError


def get_env(name: str, required: bool = True) -> str:
    value = os.environ.get(name)
    if required and not value:
        print(f"::error::{name} environment variable not set")
        sys.exit(1)
    return value or ""


def compute_merge_base(base_ref: str, head_sha: str) -> str:
    try:
        result = subprocess.run(
            ["git", "merge-base", f"origin/{base_ref}", head_sha],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        print(f"::error::Failed to compute merge base between origin/{base_ref} and {head_sha}")
        sys.exit(1)


def build_args(merge_base: str) -> list[str]:
    args = [
        "check",
        "--quiet",
        "--output-format", "github",
        "--base-commit", merge_base,
    ]

    single_value_envs = {
        "INPUT_MODEL": "--model",
        "INPUT_CONFIDENCE_THRESHOLD": "--confidence-threshold",
        "INPUT_MAX_WORKERS": "--max-workers",
    }

    for env_key, flag in single_value_envs.items():
        value = os.environ.get(env_key)
        if value:
            args.extend([flag, value])

    return args


def run_coderule(args: list[str]) -> tuple[dict, int]:
    result = subprocess.run(
        ["coderule"] + args,
        stdout=subprocess.PIPE,
        stderr=None,
        text=True,
    )

    if result.returncode == 2:
        print(f"::error::coderule failed with exit code 2")
        sys.exit(2)

    if result.returncode == 0:
        return {}, 0

    try:
        review_json = json.loads(result.stdout)
    except json.JSONDecodeError:
        print("::error::Failed to parse coderule JSON output")
        print(result.stdout)
        sys.exit(1)

    return review_json, result.returncode


def post_json(url: str, body: dict, token: str) -> tuple[int, str]:
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
    }
    data = json.dumps(body).encode()
    req = Request(url, data=data, headers=headers, method="POST")
    try:
        with urlopen(req) as resp:
            return resp.status, resp.read().decode()
    except HTTPError as e:
        return e.code, e.read().decode()


def post_review(review_json: dict, repo: str, pr_number: str, token: str):
    review_url = f"https://api.github.com/repos/{repo}/pulls/{pr_number}/reviews"
    comment_url = f"https://api.github.com/repos/{repo}/issues/{pr_number}/comments"

    status, resp_text = post_json(review_url, review_json, token)
    if status in (200, 201):
        return

    print(f"::warning::Review POST failed ({status}): {resp_text}")

    # Fallback: post as a plain issue comment
    body_parts = [review_json.get("body", "")]
    for comment in review_json.get("comments", []):
        path = comment.get("path")
        line = comment.get("line")
        text = comment.get("body", "")
        body_parts.append(f"**{path}:{line}**\n\n{text}")

    comment_body = "\n\n---\n\n".join(body_parts)

    status, resp_text = post_json(comment_url, {"body": comment_body}, token)
    if status in (200, 201):
        return

    print(f"::warning::Fallback comment POST failed ({status}): {resp_text}")
    print("::error::Failed to post GitHub review and fallback comment")
    sys.exit(1)


def main():
    base_ref = get_env("INPUT_BASE_REF")
    head_sha = get_env("INPUT_HEAD_SHA")
    pr_number = get_env("INPUT_PR_NUMBER")
    repo = get_env("GITHUB_REPOSITORY")
    token = get_env("GH_TOKEN")
    fail_on_issues = os.environ.get("INPUT_FAIL_ON_ISSUES") == "true"

    merge_base = compute_merge_base(base_ref, head_sha)
    args = build_args(merge_base)

    review_json, status = run_coderule(args)

    if status == 0:
        sys.exit(0)

    review_json["commit_id"] = head_sha
    post_review(review_json, repo, pr_number, token)

    if fail_on_issues:
        sys.exit(1)


if __name__ == "__main__":
    main()
