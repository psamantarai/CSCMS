#!/usr/bin/env bash
# agentic-swe-kit installer
# Installs all domain skills into ~/.hermes/skills/ and wiki into ~/.agentic-swe-kit/wiki/
# Sets AGENTIC_SWE_WIKI_ROOT so all skill wiki references resolve correctly.

set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_SKILLS_DIR="${HOME}/.hermes/skills"
WIKI_TARGET="${HOME}/.agentic-swe-kit/wiki"
SHELL_RC=""

# Detect shell config file
if [ -f "${HOME}/.zshrc" ]; then
  SHELL_RC="${HOME}/.zshrc"
elif [ -f "${HOME}/.bashrc" ]; then
  SHELL_RC="${HOME}/.bashrc"
elif [ -f "${HOME}/.bash_profile" ]; then
  SHELL_RC="${HOME}/.bash_profile"
fi

echo ""
echo "======================================"
echo "  agentic-swe-kit installer"
echo "======================================"
echo ""

# 1. Install wiki
echo "[1/3] Installing wiki -> ${WIKI_TARGET}"
mkdir -p "${WIKI_TARGET}"
cp -r "${REPO_DIR}/wiki/"* "${WIKI_TARGET}/"
echo "      Done. $(ls "${WIKI_TARGET}" | wc -l | tr -d ' ') domains installed."

# 2. Install skills
echo "[2/3] Installing skills -> ${HERMES_SKILLS_DIR}"
mkdir -p "${HERMES_SKILLS_DIR}/swe-foundations"
mkdir -p "${HERMES_SKILLS_DIR}/mlops"

# Orchestrator (master skill)
mkdir -p "${HERMES_SKILLS_DIR}/swe-foundations/agentic-swe-master"
cp "${REPO_DIR}/skills/orchestrator/agentic-swe-master/SKILL.md" \
   "${HERMES_SKILLS_DIR}/swe-foundations/agentic-swe-master/SKILL.md"

# Domain skills
for skill_dir in "${REPO_DIR}/skills/swe-foundations/"*/; do
  skill_name="$(basename "${skill_dir}")"
  mkdir -p "${HERMES_SKILLS_DIR}/swe-foundations/${skill_name}"
  cp "${skill_dir}/SKILL.md" "${HERMES_SKILLS_DIR}/swe-foundations/${skill_name}/SKILL.md"
  echo "      + swe-foundations/${skill_name}"
done

for skill_dir in "${REPO_DIR}/skills/mlops/"*/; do
  skill_name="$(basename "${skill_dir}")"
  mkdir -p "${HERMES_SKILLS_DIR}/mlops/${skill_name}"
  cp "${skill_dir}/SKILL.md" "${HERMES_SKILLS_DIR}/mlops/${skill_name}/SKILL.md"
  echo "      + mlops/${skill_name}"
done

echo "      Done."

# 3. Set AGENTIC_SWE_WIKI_ROOT
echo "[3/3] Setting AGENTIC_SWE_WIKI_ROOT environment variable"
export AGENTIC_SWE_WIKI_ROOT="${WIKI_TARGET}"

if [ -n "${SHELL_RC}" ]; then
  if grep -q "AGENTIC_SWE_WIKI_ROOT" "${SHELL_RC}" 2>/dev/null; then
    echo "      Already set in ${SHELL_RC}. Updating."
    sed -i.bak "s|export AGENTIC_SWE_WIKI_ROOT=.*|export AGENTIC_SWE_WIKI_ROOT=\"${WIKI_TARGET}\"|" "${SHELL_RC}"
  else
    echo "" >> "${SHELL_RC}"
    echo "# agentic-swe-kit wiki root" >> "${SHELL_RC}"
    echo "export AGENTIC_SWE_WIKI_ROOT=\"${WIKI_TARGET}\"" >> "${SHELL_RC}"
    echo "      Added to ${SHELL_RC}"
  fi
else
  echo "      WARNING: Could not detect shell config. Set manually:"
  echo "      export AGENTIC_SWE_WIKI_ROOT=\"${WIKI_TARGET}\""
fi

echo ""
echo "======================================"
echo "  Installation complete."
echo ""
echo "  Restart your shell or run:"
echo "  source ${SHELL_RC}"
echo ""
echo "  Then open your agent and say:"
echo "  'I want to build a production AI agent'"
echo "  The agentic-swe-master skill will trigger automatically."
echo "======================================"
echo ""
