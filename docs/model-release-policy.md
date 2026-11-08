# DEBS model release policy

A DEBS version number represents a tested capability release, not a branding change.

## Release rules

1. Never increment the active version by editing a label alone.
2. Every release must list concrete user-visible and technical changes.
3. Every claimed capability must have an implementation path and a reproducible acceptance test.
4. A capability that exists only as a prompt, design, disabled integration, or undeployed function must be labeled as such; it is not a verified runtime capability.
5. Run the relevant automated tests and production build. Record exact CI run and commit.
6. For agent/game-development releases, verify at least one end-to-end task against a disposable test repository or project. Record files changed, commands executed, test results, and known limitations.
7. Keep a release changelog and compare against the previous release. If there is no measurable improvement, do not create a new version.
8. Do not claim DEBS is an independently trained foundation model while it runs an imported open-weight base model. The application must use the self-hosted DEBS inference server only; third-party chat-model fallback is prohibited.

## DEBS 1.1 baseline

Status: development release.

Current implemented direction:
- Specialized code and game-development task modes.
- High reasoning effort for engineering tasks.
- Guidance for complete game projects, modular architecture, and honest test reporting.
- GitHub repository context can be supplied as a read-only snapshot.
- A durable agent-work implementation exists in the repository, but database migrations and edge functions have not been deployed; its end-to-end execution is therefore not verified.

Not yet verified as runtime capabilities:
- Autonomous multi-file repository editing from the chat interface.
- Remote execution/builds for browser, Unity, Unreal, or Godot projects.
- Automatic repair loops proven against a live project.
- Independently trained DEBS foundation model.

## Requirements before DEBS 1.2

DEBS 1.2 must deliver measurable improvements over the 1.1 baseline. Candidate acceptance gates:

- A real repository agent can inspect a selected repo, plan a change, edit multiple files on a branch, and open a draft PR without merging.
- A connected execution runner can run the project's declared checks and return actual logs.
- The agent can diagnose a failing check, make a bounded repair, and rerun the check.
- A browser-game vertical slice can be built and launched in a controlled browser runtime, with a recorded smoke test.
- The UI reports each stage and distinguishes completed, failed, skipped, and unverified work.
- CI is green and release-specific acceptance tests pass.

Unity, Unreal, and Godot runners must remain marked unavailable until each has a working, tested execution path. A prompt describing an integration does not count as an integration.

## Release evidence

For every release, record:
- version and source commit;
- feature list and comparison with the previous version;
- automated test and build results;
- end-to-end test project and reproducible evidence;
- known limitations and rollback target.
