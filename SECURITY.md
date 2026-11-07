# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Instead, report them privately using GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
(the **Security → Report a vulnerability** tab on this repository), or by email to
**volenyuk.yaroslav@gmail.com**.

Please include:

- a description of the vulnerability and its impact,
- steps to reproduce (or a proof of concept),
- affected version / commit, and any relevant configuration.

We aim to acknowledge reports within **5 business days** and to provide a
remediation timeline after triage. Please give us a reasonable window to release
a fix before any public disclosure.

## Threat model

[THREAT_MODEL.md](THREAT_MODEL.md) lists what the extension protects, from
whom, which control covers each threat and which test or tool checks it. Reports
that map to a row there (or show a gap in it) are the easiest to triage.

## Supported versions

This project is pre-1.0 and under active development. Only the latest released
version receives security fixes.

## Handling secrets

This extension handles OAuth client credentials and Dynatrace tenant
secrets. When reporting or contributing:

- **Never** include real tokens, client secrets, or `.env` contents in issues,
  pull requests, logs, or test fixtures.
- Secrets are stored in Raycast's encrypted local storage, on this machine only;
  they must never be logged or written elsewhere.
- CI runs [gitleaks](https://github.com/gitleaks/gitleaks) on every push and pull
  request to catch accidentally committed credentials.

If you believe a credential has been exposed in the git history, report it
privately as a vulnerability so it can be rotated and purged.
