# Skill sources

The ten skills in `project/skills/` come three ways. Five are **SLP files** installed with edits;
their text is the SLP author's. Three are **written for this kit**, adapting mechanisms from existing
skills without copying text beyond short phrases. Two are **written from published research**. Both
Python scripts come from SLP.

"SLP material" is the reference set in the kit owner's `SLP/` folder: a practitioner's Codex setup
(prompts, skills, concept notes) shared with the owner, with no stated license and used with the
owner's agreement. "The SLP author's talk" is their recorded community session (`meeting.txt`);
the kit borrows its mechanisms, not its words. Skills retired on 2026-09-12, with their sources, are
in git history at `db20bff^`.

## Installed from SLP, with edits

| File | Source | Changes |
|---|---|---|
| `lead/council` | `council/`, `references/report-format.md` | Codex guards and launch mechanics removed; models read from the workspace protocol's Routing; same-family Challenger named as a limitation |
| `lead/ultra-review` | `ultra-review/`, `review-pack/` | merged into hunt and pack modes selected by Open Code Review's previews; Windows paths, PowerShell and Codex upload removed; ends in a rulings table |
| `lead/repo-refresh` | `repo-refresh/` | deletions sent as Engineer briefs; opened on the Lead's judgment |
| `peer/test-proof-debt-audit` | `test-proof-debt-audit-SKILL.md`, `catalog.md` | requester is the brief; catalog cut to search families and routes |
| `supervisor/architecture-premise-audit` | `SKILL.md` | explicit-request gate dropped |
| `guides/STRUCTURAL_LENSES.md` | `structural-antipatterns.md` | condensed, every lens kept |
| `guides/FEATURE_INTAKE.md`, `guides/PLANS.md` | `FEATURE_INTAKE.md`, `PLANS.md` | paths pointed at `.seatworks/`; `PLANS.md` since rewritten |
| `ultra-review/scripts/*.py` | SLP scripts | report script builds a coverage ledger and scout assignment from OCR JSON; pack script cut to what that JSON selects; comments removed |

On 2026-09-14 every skill was cut to the job, following Anthropic's skill authoring guidance,
agentskills.io, SkillsBench and SkillReducer.

## Written for this kit

| File | Draws on |
|---|---|
| `peer/test-first` | superpowers `test-driven-development`; a Codex adaptation of it; mattpocock `tdd`; SLP material and talk |
| `peer/diagnosing-bugs` | mattpocock `diagnosing-bugs`; superpowers `systematic-debugging` |
| `peer/security-check` | addyosmani `security-and-hardening`; trailofbits `sharp-edges` (ideas only) |
| `prompts/REVIEWER.md` review procedure | mattpocock `code-review`; SLP `ultra-review` schema and lenses; alibaba/open-code-review's `delegate` contract; OpenAI Codex's review rubric; Anthropic's code-review command; Atlassian's review-agent ablation and BitsAI-CR; the PR-description bias study |
| `supervisor/pre-mortem` | Gary Klein's project premortem; SLP `council` sealed seats |
| `supervisor/retrospective` | Cemri et al.'s multi-agent failure taxonomy; the SLP author's talk |
| `supervisor/grilling`, `guides/CONTEXT_FORMAT.md` | mattpocock `grilling` and `domain-modeling` (its `CONTEXT.md` format) |
| `guides/PLANS.md`, `ADR.md`, `REVIEW.md` | Nygard's ADR, MADR, Zdun et al.'s Y-statement, AWS and Azure ADR guidance; HumanLayer plans, GitHub Spec Kit, Rust stabilization reports, Kubernetes KEPs, OpenAI ExecPlans; Anthropic prompting guidance and BMAD templates; OpenAI harness-engineering lints and Factory's lint-driven agents |
| `examples/WORKSPACE_PROTOCOL.md`, `records/NOTEBOOK.md` | the SLP author's workspace protocol and notebook; ITIL problem management and Google's SRE workbook; ACE, Mem0 and Xiong et al.; Gloaguen et al. and OpenAI harness engineering |

## Sources and licenses

| Source | Where | License |
|---|---|---|
| alibaba/open-code-review | https://github.com/alibaba/open-code-review | Apache-2.0, © 2026 Alibaba; run as a tool, no text copied |
| openclaw/openclaw, `.agents/skills/test-audit` | https://github.com/openclaw/openclaw | MIT, © 2026 OpenClaw Foundation; adapted in `v3-redesign/.claude/skills/test-audit` |
| obra/superpowers | https://github.com/obra/superpowers | MIT, © 2025 Jesse Vincent |
| mattpocock/skills | https://github.com/mattpocock/skills | MIT, © 2026 Matt Pocock |
| addyosmani/agent-skills | https://github.com/addyosmani/agent-skills | MIT, © 2025 Addy Osmani |
| trailofbits/skills, `sharp-edges` | https://github.com/trailofbits/skills | CC-BY-SA-4.0; ideas only |
| Gary Klein, "Performing a Project Premortem" | https://hbr.org/2007/09/performing-a-project-premortem | © Harvard Business Review; ideas only |
| Cemri et al., "Why Do Multi-Agent LLM Systems Fail?" | https://arxiv.org/abs/2503.13657 | ideas only |
| Michael Nygard, "Documenting Architecture Decisions" | https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions | ideas only |
| MADR | https://adr.github.io/madr/ | ideas only |
| Y-statement (Zdun et al.) | https://socadk.github.io/design-practice-repository/artifact-templates/DPR-ArchitecturalDecisionRecordYForm.html | ideas only |
| AWS Prescriptive Guidance, ADR process | https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html | ideas only |
| HumanLayer, advanced context engineering | https://github.com/humanlayer/advanced-context-engineering-for-coding-agents | ideas only |
| GitHub Spec Kit | https://github.com/github/spec-kit | ideas only |
| OpenAI Cookbook, ExecPlans | https://developers.openai.com/cookbook/articles/codex_exec_plans | ideas only |
| Rust stabilization guide | https://rustc-dev-guide.rust-lang.org/stabilization-guide.html | ideas only |
| Anthropic, Claude prompting best practices | https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices | ideas only |
| BMAD-METHOD | https://github.com/bmad-code-org/BMAD-METHOD | ideas only |
| Factory, "Using linters to direct agents" | https://factory.ai/news/using-linters-to-direct-agents | ideas only |
| ITIL problem management | https://wiki.en.it-processmaps.com/index.php/Problem_Management | ideas only |
| Google SRE workbook, postmortem culture | https://sre.google/workbook/postmortem-culture/ | ideas only |
| Gloaguen et al., repository context files | https://arxiv.org/abs/2602.11988 | ideas only |
| Xiong et al., memory management for LLM agents | https://arxiv.org/abs/2505.16067 | ideas only |
| SLP material | the kit owner's `SLP/` folder | no license stated; used with the owner's agreement |
