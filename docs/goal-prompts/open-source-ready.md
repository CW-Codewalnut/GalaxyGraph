# Galaxy Graph Open-Source Readiness `/goal` Prompt

Copy/paste this into Hermes as a `/goal` command from a session with access to the local repos.

```text
/goal Make Galaxy Graph genuinely open-source ready, comparable in polish and trustworthiness to established open-source developer tools, while preserving any validation app untouched unless explicitly approved.

Context:
- New local repo: /Users/agents/Agents/Neo/workspace/repos/personal/galaxy-graph
- Optional source app repo, read-only for this goal: /path/to/validation-app
- Current Galaxy Graph extraction commit: 4daf849 feat: extract Galaxy Graph open source packages
- Product goal: Galaxy Graph is a backend-agnostic visualization tool for architecture, service intent, tests, mutation confidence, contracts, event topics, and semantic JSDoc/TSDoc. It should become standalone OSS IP that any app can consume as a package.
- Desired quality bar: polished public repo readiness — clear positioning, badges, verified demo media, install docs, CI, tests, package metadata, security hygiene, and honest caveats.

Hard constraints:
- Do not modify the validation app in this goal. Use it only as a read-only validation target for adapters/CLI.
- Do not publish, create GitHub remotes, push, or mutate GitHub until Ben explicitly approves.
- Do not include private app data as default sample/demo data. Use sanitized toy/sample datasets or generated public-safe fixtures.
- Keep secrets out of files, process args, docs, screenshots, and final reports.
- Preserve repo hygiene: inspect git status before edits, keep generated build outputs ignored, and finish with clean committed changes in galaxy-graph.

Mission:
1. Audit the current galaxy-graph repo against polished OSS readiness.
2. Add high-quality README polish:
   - centered hero section;
   - badges for CI/license/npm or pre-public placeholders where a remote is not yet created;
   - concise product pitch;
   - real screenshot/GIF/MP4 demo section if feasible;
   - quick start;
   - CLI usage;
   - package usage;
   - adapter architecture;
   - semantic JSDoc/TSDoc convention;
   - roadmap and honest current limitations.
3. Add public repo hygiene files:
   - CONTRIBUTING.md;
   - SECURITY.md;
   - CHANGELOG.md or release notes stub;
   - CODE_OF_CONDUCT.md if appropriate;
   - .env.example only if environment variables are introduced.
4. Improve package publish readiness:
   - package metadata for root/core/adapters/cli/example as appropriate;
   - repository/homepage/bugs fields using the intended GitHub org/user path, but avoid pretending a remote exists if uncertain;
   - keywords, author, license, files allowlist, exports, bin validation;
   - confirm npm pack contents for publishable packages.
5. Add GitHub Actions CI files locally:
   - install;
   - build;
   - typecheck;
   - tests;
   - audit or dependency review if suitable.
6. Add real tests before claiming readiness:
   - schema/buildGraph tests;
   - JSDoc semantic extraction tests;
   - Stryker adapter tests;
   - Encore adapter fixture tests using sanitized miniature fixture, not private app data;
   - CLI smoke test that writes graph JSON to a temp output.
7. Improve adapter parity enough for credible MVP:
   - Encore services/endpoints/topics already work; preserve that;
   - add/verify contract/test extraction on a small fixture;
   - add/verify mutation aggregate and preferably endpoint/service mapping where feasible;
   - document any remaining parity gaps clearly.
8. Create verified public demo asset if practical:
   - run the example app locally;
   - capture a real screenshot or short MP4/GIF of the graph, not a mock;
   - store in docs/assets/;
   - reference it from README.
9. Resolve or clearly document npm audit findings. Prefer safe dependency upgrades; do not force breaking upgrades blindly.
10. Verify:
    - npm install or npm ci from clean state if practical;
    - npm run build;
    - npm run typecheck;
    - npm test;
    - npm audit result recorded;
    - npm pack --dry-run for publishable packages;
    - CLI generation against sanitized fixture;
    - optional read-only smoke against a validation app without writing into it.
11. Commit cohesive changes locally in galaxy-graph with conventional commit messages.
12. Final report must include:
    - what changed;
    - exact verification commands/results;
    - remaining launch blockers, if any;
    - whether it is now “open-source ready” or still “pre-public beta”;
    - what approval is needed before GitHub creation/push/npm publish.

Definition of done:
- Galaxy Graph can be shown to Ben as a credible open-source repo candidate with polished README/docs, tests, CI config, package metadata, verified demo media or explicit reason if deferred, and clean local git status after committing.
- Any validation app remains clean and unmodified.
```
