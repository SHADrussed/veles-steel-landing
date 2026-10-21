# Existing local QA workflow

Runtime: Node >=22.12, Playwright 1.62.1, installed Chromium. Working dependencies and browser were reused; no installation was needed for this change. package-lock.json records versions for a separate environment setup if required.

```sh
npm test
npm run qa:cycle
```

The existing pilot runner starts a local static server on 127.0.0.1:4183 or reuses a responding server. Confirm that an existing listener belongs to this checkout. It runs functional acceptance checks, responsive screenshots at 320/390/960/1440/1920 and Figma QA Bridge 0.1.0. Reports use new folders under qa-results/cycle-* and .figma-qa/results/run-*. A failed stage gives exit code 1; the owned server stops afterwards. No external form submission or deployment occurs.

Private local configuration is intentionally excluded from Git. qa:cycle requires a configured qa.manifest.json and its real approved reference. In this working checkout they already exist and were reused. For another checkout, first obtain the approved export locally through Figma Design Downloader 0.2.0 following tools/figma-design-downloader/CODEX.md, then use the existing Bridge configuration command described in tools/figma-qa/README.md:

```sh
npm run qa:configure -- --metadata /private/export/metadata.json --route / --ready-selector '.hero h1' --base-url http://127.0.0.1:4183 --framework existing
```

Do not run configure again over an existing manifest. Start the server with `node qa-server.mjs site/dist 4183` for standalone qa:visual; the full qa:cycle starts it automatically. One Bridge manifest covers one route and viewport. The current local comparison is homepage desktop only; responsive tests establish technical behavior, not Figma fidelity. Never scale a desktop PNG into a mobile baseline or update an approved baseline automatically.

Before changing a confirmed defect, add a stable ID with attempts=0 and state=confirmed to ignored qa-issues.json (shape: {"issues":[{"id":"ISSUE_ID","state":"confirmed","attempts":0,"evidence":"route, viewport, observed failure"}]}), then run `npm run qa:attempt -- ISSUE_ID`. Preserve counters and source evidence locally. The fourth attempt and needs-design/resolved states are rejected. Close the issue after successful tests and screenshot review. The CLI does not prevent arbitrary manual editing; AGENTS.md requires using it before corrections.

This PR carries the existing pilot QA runtime, not a new QA framework. Downloader ships runtime/docs only here; its original release tests and examples stay in the local tool release. Bridge source files are unmodified. Binary references, original client materials, snapshots, local manifests and detailed private reports must not be added to public commits. The QA tests cover observable application behavior; they cannot verify business correctness without approved contacts, copy, formulas and prices.
