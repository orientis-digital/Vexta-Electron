# Clean Commit Quick Reference

**One-page cheatsheet for Clean Commit workflow**

---

## Format

```
<emoji> <type> (<scope>): <description>

- <detailed technical change 1>
- <detailed technical change 2>

NOTES:
- <optional note, warning, migration instruction, or caveat whenever needed>
```

---

## The 9 Types

| Emoji | Type | Use For |
|:-----:|------|---------|
| 📦 | `new` | Adding code, features, files |
| 🔧 | `update` | Changing existing code, refactoring |
| 🗑️ | `remove` | Removing code, files, features |
| 🔒 | `security` | Security fixes, patches, vulnerabilities |
| ⚙️ | `setup` | Project configs, CI/CD, tooling |
| ☕ | `chore` | Maintenance, dependencies, housekeeping |
| 🧪 | `test` | Test changes and additions |
| 📖 | `docs` | Documentation updates |
| 🚀 | `release` | Version releases |

---

## Quick Decision Flowchart

```
Releasing a version?        → 🚀 release
Security fix?               → 🔒 security
Only docs?                  → 📖 docs
Only tests?                 → 🧪 test
Config/CI/tooling?          → ⚙️ setup
Removing something?         → 🗑️ remove
Adding new functionality?   → 📦 new
Changing existing code?     → 🔧 update
Maintenance/cleanup?        → ☕ chore
```

---

## Detailed Changes & Notes Guidelines

Every commit message consists of up to 3 parts:

1. **Subject Line**: `<emoji> <type> (<scope>): <description>` (max 72 chars, imperative present tense, no period at end).
2. **Detailed Changes Body**: A bulleted list summarizing exact technical modifications (e.g. methods added, schemas changed, UI state fixes).
3. **`NOTES:` Section**: Include a `NOTES:` block whenever needed by that commit. Common use cases:
   - Migration or upgrade instructions
   - Environment variable updates or config changes
   - Security warnings or deployment order dependencies
   - Breaking change details

---

## Rules Checklist

- ✅ Emoji matches the type
- ✅ Type is lowercase
- ✅ `!` immediately after type (no space) if breaking change — only for `new`, `update`, `remove`, `security`
- ✅ Space after colon
- ✅ Present tense description
- ✅ Lowercase first letter of description
- ✅ No period at end of subject line
- ✅ Under 72 characters total for subject line
- ✅ **Detailed changes** listed as bullet points in the body
- ✅ **`NOTES:` section** included whenever relevant context/warnings/instructions exist for that commit

---

## Breaking Changes

Use `!` immediately after the type to signal a breaking change in the subject line. Only valid for `new`, `update`, `remove`, and `security` types:

```
📦 new!: completely redesign authentication system
🔧 update!: drop support for node 14
🗑️ remove!: remove deprecated v1 api endpoints
🔒 security!: enforce tls 1.2 minimum across all connections
🔧 update! (api): change response format for all endpoints
```

Include breaking details in the `NOTES:` section:

```
🔧 update! (api): change authentication endpoint response format

- Replace token string response with nested session object containing refresh tokens
- Update client payload parser in authentication bridge

NOTES:
- BREAKING CHANGE: Authentication endpoint now returns session object instead of plain token string.
- Existing v1 clients must be updated to v2.0 SDK before upgrading backend services.
```

---

## Scope Guidelines

**Optional but useful for larger projects**

Good scopes:
- Component: `(header)`, `(footer)`, `(navbar)`
- Module: `(api)`, `(database)`, `(auth)`
- Feature: `(payments)`, `(notifications)`

Keep scopes:
- Short (prefer one word)
- Lowercase
- Consistent across project

---

## Git Message Template

Create a `.gitmessage` file in your project:

```
# <emoji> <type> (<scope>): <description>
# 
# - <detailed technical change 1>
# - <detailed technical change 2>
# 
# NOTES:
# - <note, migration instruction, or warning whenever needed>
#
# Types:
# 📦 new       - Adding code
# 🔧 update    - Changing code
# 🗑️ remove    - Removing code
# 🔒 security  - Security fixes
# ⚙️ setup     - Project configs
# ☕ chore     - Maintenance
# 🧪 test      - Tests
# 📖 docs      - Documentation
# 🚀 release   - Version releases
#
# Rules:
# - Use present tense
# - Lowercase type and description
# - No period at end of subject line
# - Max 72 chars for subject line
# - Always list detailed technical changes in the body
# - Include a NOTES: section whenever needed by the commit
```

### Set up the template globally:

```bash
git config --global commit.template ~/.gitmessage
```

### Or per project:

```bash
git config commit.template .gitmessage
```

---

## Common Patterns

### Dependency Updates
```
☕ chore (deps): bump express from 4.17.1 to 4.18.2
☕ chore: update all dev dependencies
🔒 security: update lodash to fix vulnerability
```

### Refactoring
```
🔧 update: refactor user service to use async/await
🔧 update (api): simplify error handling middleware
🔧 update: extract validation logic to utils
```

### Adding Features
```
📦 new: real-time notifications with websockets
📦 new (api): pagination support for all endpoints
📦 new: export data to csv functionality
```

### Bug Fixes
```
🔧 update: fix date formatting in profile
🔧 update (api): handle null values in response
🔒 security: fix auth token validation bypass
```

### Testing
```
🧪 test: add e2e tests for checkout flow
🧪 test (unit): increase coverage for utils
🧪 test: mock external api in integration tests
```

---

## Tips

1. **One commit = One logical change**
   - Don't mix types in one commit
   - Split unrelated changes

2. **Write for humans**
   - Be clear and descriptive
   - Think: "What did this commit accomplish?"

3. **Be consistent**
   - Stick to the workflow
   - Use the same scope names

4. **When in doubt, check the decision tree**
   - Start from top (release? security?)
   - Work your way down
