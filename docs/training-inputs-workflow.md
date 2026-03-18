# Training Inputs Workflow

`Training_Inputs/` is a managed reference library for framework/process material.

This workflow is designed to keep changes explicit:

- New or edited files are detected and summarized first.
- Nothing becomes active until you explicitly accept.
- Agent/Ollama context is regenerated only on acceptance.

## Commands

Run review (proposal only):

```sh
npm run training:review
```

Accept reviewed changes (explicit apply):

```sh
npm run training:accept -- --yes
```

## Outputs

Review output:

- `docs/training-inputs/proposed-changes.md`
- `docs/training-inputs/proposed-changes.json`

Accepted state:

- `docs/training-inputs/state.json`
- `docs/training-inputs/active-sources.json`
- `docs/training-inputs/agent-context.md`
- `docs/training-inputs/ollama-context.txt`

## Summary Files (important)

Most files in `Training_Inputs/` are binary (`.pdf`, `.ppt`), so they cannot be reliably ingested as text by default.

To make a file useful for agents and local Ollama context, add a sidecar summary file:

`Training_Inputs/summaries/<original-file-name>.md`

Example:

- source file: `Training_Inputs/JTBD_Frameworks.pdf`
- summary file: `Training_Inputs/summaries/JTBD_Frameworks.pdf.md`

These summaries are what get exported into `agent-context.md` and `ollama-context.txt`.

## Approval Rule

Do not make prompt/scoring/framework code changes directly from newly added training material.

Use this order:

1. Run review and inspect proposed impacts.
2. Decide what should change.
3. Accept only when you want the library update active.
4. Make code/process changes in a separate, reviewable commit.

