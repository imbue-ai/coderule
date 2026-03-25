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

### List rules

```bash
# Show rules matching the current diff
coderule list

# Show all rules in the repo
coderule list --all
```