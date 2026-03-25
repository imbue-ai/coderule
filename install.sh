#!/usr/bin/env bash
set -euo pipefail

REPO="imbue-ai/coderule"
INSTALL_DIR="${CODERULE_INSTALL_DIR:-$HOME/.coderule/bin}"

get_target() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Linux)  os="linux" ;;
    Darwin) os="macos" ;;
    *)
      echo "Error: unsupported OS: $os" >&2
      exit 1
      ;;
  esac

  case "$arch" in
    x86_64|amd64)  arch="x86_64" ;;
    arm64|aarch64) arch="aarch64" ;;
    *)
      echo "Error: unsupported architecture: $arch" >&2
      exit 1
      ;;
  esac

  echo "coderule-${os}-${arch}"
}

get_download_url() {
  local artifact="$1"
  local url

  url="$(
    curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep -o "\"browser_download_url\":[[:space:]]*\"[^\"]*${artifact}[^\"]*\"" \
    | head -1 \
    | cut -d'"' -f4
  )"

  if [ -z "$url" ]; then
    echo "Error: could not find download for ${artifact}" >&2
    echo "Check https://github.com/${REPO}/releases for available binaries." >&2
    exit 1
  fi

  echo "$url"
}

add_to_path() {
  local shell_name rc_file line
  line="export PATH=\"${INSTALL_DIR}:\$PATH\""

  case "${SHELL:-}" in
    */zsh)  shell_name="zsh";  rc_file="$HOME/.zshrc" ;;
    */bash) shell_name="bash"; rc_file="$HOME/.bashrc" ;;
    *)      shell_name="";     rc_file="" ;;
  esac

  if [ -n "$rc_file" ] && ! grep -qF "$INSTALL_DIR" "$rc_file" 2>/dev/null; then
    echo "" >> "$rc_file"
    echo "# coderule" >> "$rc_file"
    echo "$line" >> "$rc_file"
    echo "Added ${INSTALL_DIR} to PATH in ${rc_file}"
    echo "Run 'source ${rc_file}' or open a new terminal to use coderule."
  elif echo "$PATH" | tr ':' '\n' | grep -qF "$INSTALL_DIR"; then
    : # already in PATH
  else
    echo "Add this to your shell profile to persist coderule in PATH:"
    echo "  $line"
  fi
}

main() {
  local artifact url

  artifact="$(get_target)"
  echo "Detected platform: ${artifact}"

  url="$(get_download_url "$artifact")"
  echo "Downloading from: ${url}"

  mkdir -p "$INSTALL_DIR"

  curl -fsSL "$url" -o "${INSTALL_DIR}/coderule"
  chmod +x "${INSTALL_DIR}/coderule"

  echo "Installed coderule to ${INSTALL_DIR}/coderule"

  add_to_path

  echo "Done! Run 'coderule --help' to get started."
}

main
