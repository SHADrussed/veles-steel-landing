# Veles Steel development

Use QA-WORKFLOW.md and the existing QA tools. Work on a dedicated branch. Do not merge, deploy, change production hosting, DNS, mail or real spreadsheets without separate authorization.

Keep all customer correspondence, attachments, local design references, signed export responses and QA screenshots outside public Git history. Use only confirmed requirements and existing approved copy. Missing contacts, copy, prices and calculation formulas block the dependent change.

Before each correction, record its evidence in the ignored local qa-issues.json and reserve a cycle with `npm run qa:attempt -- ISSUE_ID`. Keep the same ID and counter across retries, maximum three attempts. Stop on ambiguity or after three unsuccessful corrections and consolidate questions for the user. Never reset counters to bypass this limit.

Run `npm test` and `npm run qa:cycle` after each logical group. Inspect actual screenshots and Bridge reports; technical PASS does not mean visual design approval. Preserve local baselines unchanged. Reuse working dependencies. Do not add QA infrastructure when the existing tools suffice.
