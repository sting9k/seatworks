# Notice

Seatworks is MIT-licensed (`LICENSE`). Parts of what its agents read were drawn from other work, listed here with
their licenses. Text is written for this repository unless a row says it was adapted; "ideas only" means no text was
copied.

"SLP material" is the reference set in the owner's `SLP/` folder: a practitioner's Codex setup (prompts, skills,
concept notes) shared with the owner, with no stated license and used with the owner's agreement. "The SLP author's
talk" is their recorded community session; its mechanisms are borrowed, not its words. The first version of this
plugin, removed on 2026-09-29, is in git history, and several skills below began there.

## What agents read: `templates/slp/`

| File                                          | Draws on                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `roles/reviewer.md`                           | mattpocock `code-review`; SLP `ultra-review` lenses; OpenAI Codex's review rubric; Anthropic's code-review command         |
| `skills/grilling`                             | mattpocock `grilling`, `domain-modeling` and `wayfinder`; superpowers `brainstorming`                                     |
| `skills/pre-mortem`                           | Gary Klein's project premortem; SLP `council` sealed seats                                                                |
| `skills/retrospective`                        | Cemri et al.'s multi-agent failure taxonomy; the SLP author's talk and articles                                           |
| `skills/planning-lanes`                       | SLP material (feature intake and plans); addyosmani `api-and-interface-design`                                            |
| `skills/blind-design`                         | SLP `council`, rewritten so the designs never share a room                                                                |
| `skills/test-first`                           | superpowers `test-driven-development`; mattpocock `tdd`; SLP material and talk                                            |
| `skills/diagnosing-bugs`                      | mattpocock `diagnosing-bugs`; superpowers `systematic-debugging`, `condition-based-waiting` and `find-polluter`            |
| `skills/open-code-review`                     | alibaba `open-code-review` (Apache-2.0): its delegation steps and its second reading of each finding, reworded; its `ocr` is run, not shipped |
| `skills/security-check`                       | addyosmani `security-and-hardening`; trailofbits `sharp-edges` (ideas only)                                               |
| `skills/proof-audit`                          | SLP `test-proof-debt-audit` and its catalog; OpenClaw `test-audit` (MIT), through `.claude/skills/test-audit`, reworded   |
| `skills/architecture-premise-audit`           | SLP `architecture-premise-audit` and its structural anti-patterns, condensed                                              |
| `skills/repo-refresh`                         | SLP `repo-refresh`, rewritten for scopes and the record                                                                   |
| `skills/domain-docs`, `shared/views/docs.ts`  | mattpocock `domain-modeling` (its `GLOSSARY.md` and ADR formats), `setup-matt-pocock-skills` and `wayfinder` (the map)   |
| `skills/spike`                                | mattpocock `prototype`; superpowers `brainstorming`                                                                       |
| `skills/measuring`                            | addyosmani `performance-optimization`                                                                                     |
| `skills/tidy-first`                           | Kent Beck, _Tidy First?_; Martin Fowler, _Refactoring_ (ideas only); mattpocock `code-review`; addyosmani `code-simplification` |
| `skills/acceptance-walk`                      | openclaw `behavior-validator`; superpowers `verification-before-completion`; anthropics `webapp-testing` (ideas only)    |
| `skills/appetite`, `skills/lane-portfolio`    | Basecamp, _Shape Up_; Donald Reinertsen, _The Principles of Product Development Flow_; mattpocock `wayfinder` (ideas only) |

## What builders read: `.claude/skills/`

| File                          | Draws on                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `.claude/skills/test-audit`   | OpenClaw's `.agents/skills/test-audit`, adapted; its license is in `.claude/skills/test-audit/LICENSE` |

## Sources and licenses

| Source                                                          | Where                                                                   | License                                           |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------- |
| obra/superpowers                                                | https://github.com/obra/superpowers                                     | MIT, © 2025 Jesse Vincent                         |
| mattpocock/skills                                               | https://github.com/mattpocock/skills                                    | MIT, © 2026 Matt Pocock                           |
| addyosmani/agent-skills                                         | https://github.com/addyosmani/agent-skills                              | MIT, © 2025 Addy Osmani                           |
| openclaw/openclaw, `.agents/skills/test-audit`                  | https://github.com/openclaw/openclaw                                    | MIT, © 2026 OpenClaw Foundation                   |
| openclaw/agent-skills, `behavior-validator`                     | https://github.com/openclaw/agent-skills                                | MIT, © 2026 openclaw; ideas only                  |
| anthropics/skills, `webapp-testing`                             | https://github.com/anthropics/skills                                    | Apache-2.0; ideas only                            |
| trailofbits/skills, `sharp-edges`                               | https://github.com/trailofbits/skills                                   | CC-BY-SA-4.0; ideas only                          |
| Gary Klein, "Performing a Project Premortem"                    | https://hbr.org/2007/09/performing-a-project-premortem                  | © Harvard Business Review; ideas only             |
| Cemri et al., "Why Do Multi-Agent LLM Systems Fail?"            | https://arxiv.org/abs/2503.13657                                        | ideas only                                        |
| Basecamp, _Shape Up_                                            | https://basecamp.com/shapeup                                            | © Basecamp; ideas only                            |
| Donald Reinertsen, _The Principles of Product Development Flow_ | ISBN 978-1935401001                                                     | ideas only                                        |
| Kent Beck, _Tidy First?_; Martin Fowler, _Refactoring_          | O'Reilly 2023; Addison-Wesley 2018                                      | ideas only                                        |
| Michael Nygard, "Documenting Architecture Decisions"            | https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions | ideas only                                       |
| SLP material                                                    | the owner's `SLP/` folder                                               | no license stated; used with the owner's agreement |
