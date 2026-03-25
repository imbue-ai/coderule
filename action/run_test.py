"""Tests for action/run.py."""

import json
import os
import subprocess
import unittest
from unittest.mock import MagicMock, patch

from run import build_args, get_env, post_review, run_coderule


class TestGetEnv(unittest.TestCase):
    @patch.dict(os.environ, {"FOO": "bar"})
    def test_returns_value(self):
        self.assertEqual(get_env("FOO"), "bar")

    @patch.dict(os.environ, {}, clear=True)
    def test_missing_required_exits(self):
        with self.assertRaises(SystemExit) as ctx:
            get_env("MISSING_VAR")
        self.assertEqual(ctx.exception.code, 1)

    @patch.dict(os.environ, {}, clear=True)
    def test_missing_optional_returns_empty(self):
        self.assertEqual(get_env("MISSING_VAR", required=False), "")


class TestBuildArgs(unittest.TestCase):
    @patch.dict(os.environ, {}, clear=True)
    def test_base_args(self):
        args = build_args("abc123")
        self.assertEqual(args, [
            "check", "--quiet", "--output-format", "github",
            "--base-commit", "abc123",
        ])

    @patch.dict(os.environ, {"INPUT_MODEL": "claude-opus-4-6", "INPUT_CONFIDENCE_THRESHOLD": "0.8"})
    def test_optional_flags(self):
        args = build_args("abc123")
        self.assertIn("--model", args)
        self.assertIn("claude-opus-4-6", args)
        self.assertIn("--confidence-threshold", args)
        self.assertIn("0.8", args)

    @patch.dict(os.environ, {"INPUT_MAX_WORKERS": "3"})
    def test_max_workers(self):
        args = build_args("abc123")
        self.assertIn("--max-workers", args)
        self.assertIn("3", args)


class TestRunCoderule(unittest.TestCase):
    @patch("run.subprocess.run")
    def test_exit_code_0_returns_empty(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="")
        result, code = run_coderule(["check"])
        self.assertEqual(code, 0)
        self.assertEqual(result, {})

    @patch("run.subprocess.run")
    def test_exit_code_2_exits(self, mock_run):
        mock_run.return_value = MagicMock(returncode=2, stdout="")
        with self.assertRaises(SystemExit) as ctx:
            run_coderule(["check"])
        self.assertEqual(ctx.exception.code, 2)

    @patch("run.subprocess.run")
    def test_exit_code_1_parses_json(self, mock_run):
        payload = {"body": "found issues", "event": "COMMENT", "comments": []}
        mock_run.return_value = MagicMock(returncode=1, stdout=json.dumps(payload))
        result, code = run_coderule(["check"])
        self.assertEqual(code, 1)
        self.assertEqual(result, payload)

    @patch("run.subprocess.run")
    def test_exit_code_1_bad_json_exits(self, mock_run):
        mock_run.return_value = MagicMock(returncode=1, stdout="not json")
        with self.assertRaises(SystemExit) as ctx:
            run_coderule(["check"])
        self.assertEqual(ctx.exception.code, 1)


class TestPostReview(unittest.TestCase):
    @patch("run.post_json")
    def test_successful_review(self, mock_post):
        mock_post.return_value = (201, "{}")
        review = {"body": "test", "event": "COMMENT", "comments": [], "commit_id": "abc"}
        post_review(review, "owner/repo", "1", "token")
        mock_post.assert_called_once()
        url = mock_post.call_args[0][0]
        self.assertIn("/pulls/1/reviews", url)

    @patch("run.post_json")
    def test_review_fails_falls_back_to_comment(self, mock_post):
        mock_post.side_effect = [
            (422, "Validation Failed"),
            (201, "{}"),
        ]
        review = {
            "body": "summary",
            "event": "COMMENT",
            "comments": [{"path": "foo.py", "line": 10, "body": "issue here"}],
            "commit_id": "abc",
        }
        post_review(review, "owner/repo", "1", "token")
        self.assertEqual(mock_post.call_count, 2)
        fallback_url = mock_post.call_args_list[1][0][0]
        self.assertIn("/issues/1/comments", fallback_url)

    @patch("run.post_json")
    def test_both_fail_exits(self, mock_post):
        mock_post.side_effect = [
            (422, "Validation Failed"),
            (500, "Server Error"),
        ]
        review = {"body": "test", "event": "COMMENT", "comments": [], "commit_id": "abc"}
        with self.assertRaises(SystemExit) as ctx:
            post_review(review, "owner/repo", "1", "token")
        self.assertEqual(ctx.exception.code, 1)


if __name__ == "__main__":
    unittest.main()
