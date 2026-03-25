# coderule

Codebase-specific agentic code reviews. Define rules as comments in your code and coderule checks every diff against them using Claude.

## How it works

Add `CODERULE:` annotations anywhere in your codebase:

```python
# CODERULE: All API endpoints must validate authentication before processing requests
```

Optionally scope a rule to specific file paths with a glob:

```typescript
// CODERULE[src/db/**]: Never use raw SQL — always use the query builder
```

Run `coderule` and it diffs your branch, finds matching rules, and uses Claude to check each one. Violations are reported with file, line, confidence, and explanation.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/imbue-ai/coderule/main/install.sh | bash
```

Or set a custom install location:

```bash
CODERULE_INSTALL_DIR=/usr/local/bin curl -fsSL https://raw.githubusercontent.com/imbue-ai/coderule/main/install.sh | bash
```

Requires an `ANTHROPIC_API_KEY` environment variable for non-agentic mode, or Claude Code when running with `--agentic`.

## Usage

```bash
# Check current diff against all matching rules
coderule

# Use agentic mode (requires Claude Code CLI)
coderule --agentic

# Check only staged changes
coderule --staged

# Diff against a specific commit
coderule --base-commit main

# JSON output
coderule --output-format json

# GitHub PR review comment format
coderule --output-format github
```

## GitHub Action

Add coderule to your CI to automatically review pull requests:

```yaml
# .github/workflows/coderule.yml
name: Coderule

on:
  push:
    branches: [main]
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  coderule:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: imbue-ai/coderule@main
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

On pull requests, violations are posted as inline review comments. On push, violations are logged to the workflow output.

**Inputs:**

| Input | Default | Description |
|-------|---------|-------------|
| `agentic` | `false` | Use Claude Code CLI for agentic review |
| `model` | | Model to use |
| `confidence-threshold` | | Minimum confidence (0.0-1.0) |
| `max-workers` | | Parallel rule checks |
| `fail-on-issues` | `false` | Fail the workflow on violations |

### List rules

```bash
# Show rules matching the current diff
coderule list

# Show all rules in the repo
coderule list --all
```