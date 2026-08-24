---
name: clean-commit
description: Format and validate git commit messages according to the Clean Commit workflow. Use when creating commits, setting up git message templates, or seeking guidance on commit types and emojis.
---

# Clean Commit

This skill helps you maintain a clean and consistent git history using the Clean Commit workflow.

## Quick Start

1.  **Analyze changes**: Run `git diff --cached` to see staged changes. Identify all technical modifications for the commit body.
2.  **Select type**: Use the decision tree in [clean-commit-guide.md](references/clean-commit-guide.md) to pick the right type.
3.  **Format message**: 
    - **Subject**: `<emoji> <type> (<scope>): <description>`
    - **Body**: Detailed bulleted list of specific code and architecture changes.
    - **Notes (Optional)**: A `NOTES:` section whenever additional context, breaking changes, or post-deploy instructions are needed.
4.  **Validate**: Check against the [rules checklist](references/clean-commit-guide.md#rules-checklist).

## Core Workflow

### 1. Identify the Change Type and Detailed Changes

Always examine the staged changes before writing the commit message.
- Use `git diff --cached` to see exactly what is being committed.
- **Detailed Changes**: Every commit MUST include a bulleted list of technical changes in the commit body (e.g. modified functions, updated database schemas, new IPC endpoints).
- **`NOTES:` Section**: Include a `NOTES:` block at the end of the commit message whenever needed (e.g., breaking changes, environment variables required, migration steps, security caveats).

| Emoji | Type | Purpose |
| :---: | :--- | :--- |
| 📦 | `new` | New features or files |
| 🔧 | `update` | Bug fixes, refactoring, improvements |
| 🗑️ | `remove` | Deletions |
| 🔒 | `security` | Security-related fixes |
| ⚙️ | `setup` | Configuration and tooling |
| ☕ | `chore` | Maintenance and dependencies |
| 🧪 | `test` | Adding or fixing tests |
| 📖 | `docs` | Documentation only |
| 🚀 | `release` | Versioning |

### 2. Formatting Rules

- **Lowercase**: Type and description must be lowercase.
- **Present Tense**: Use "add feature" not "added feature".
- **No Period**: Do not end the subject description with a period.
- **Breaking Changes**: Add `!` immediately after the type (e.g., `update!`) for breaking changes.
- **Max Length**: Keep the subject line under 72 characters.
- **Body & Notes**: Separate subject, body, and `NOTES:` sections with blank lines.

### 3. Setting Up a Template

To set up a git commit template for a project:

1.  Copy [assets/.gitmessage](assets/.gitmessage) to the project root as `.gitmessage`.
2.  Run `git config commit.template .gitmessage`.

For global setup:
1.  Copy [assets/.gitmessage](assets/.gitmessage) to `~/.gitmessage`.
2.  Run `git config --global commit.template ~/.gitmessage`.

## Advanced Usage

For detailed guidance on scopes, breaking changes, detailed changes, NOTES sections, and common patterns, refer to [clean-commit-guide.md](references/clean-commit-guide.md).

