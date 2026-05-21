# Confluence Weaver

Sync Confluence pages into your Obsidian Vault as Markdown files.

Works with both **Confluence Cloud** (Basic auth) and **Confluence Data Center / Server** (Bearer token).

---

## Features

- **CQL Profiles** — define multiple Confluence Query Language queries, each targeting a different folder in your Vault
- **Incremental sync** — only pages whose version has changed are written; unchanged pages are skipped
- **Storage Format → Markdown** — converts headings, paragraphs, tables, code blocks, task lists, info panels, and more
- **Frontmatter** — every page gets `confluence_id`, `confluence_url`, `title`, `space`, `author`, `created`, `updated`, `version`, and `labels`
- **User note protection** — content you write below the section marker is preserved across syncs
- **Wiki-links** — Confluence internal page links can be converted to Obsidian `[[wiki-link]]` format (optional)
- **Folder hierarchy** — ancestor pages can be mirrored as nested folders
- **Custom field mappings** — map any dot-path in the Confluence page JSON to a custom frontmatter key
- **Jira Weaver bridge** — replace Confluence URLs in Jira Weaver pages with `[[wiki-link]]`s automatically
- **Sync log panel** — per-profile created / updated / skipped / error counters
- **Auto sync** — run on startup and/or on a configurable interval (1–1440 minutes)

---

## Installation

Search for **Confluence Weaver** in *Settings → Community plugins → Browse*.

---

## Setup

1. Open *Settings → Confluence Weaver*
2. Enter your **Confluence domain** (e.g. `https://acme.atlassian.net/wiki`)
3. Choose **Auth mode**:
   - *Basic auth (Cloud)* — enter your email and an [API token](https://id.atlassian.com/manage-profile/security/api-tokens)
   - *Bearer token (DC/Server)* — enter a Personal Access Token
4. Click **Test connection** — a notice confirms success
5. Add one or more **CQL Profiles** with a query, target folder, and page limit
6. Open the command palette and run **Sync Pages**

---

## CQL examples

```
space = "DEV" AND ancestor = "Architecture" ORDER BY lastmodified DESC
space = "TEAM" AND label = "weekly-report"
type = "page" AND creator = currentUser() AND lastModified >= startOfMonth()
```

---

## Section marker

Each synced file ends with:

```
[confluence-weaver section end]
```

Text you write **after** this line is preserved on every re-sync. Write personal notes, backlinks, or tags there.

---

## Custom field mappings

In *Settings → Advanced → Custom field mappings*, enter one mapping per line:

```
space.key → project
version.number → revision
history.createdBy.displayName → confluence_author
```

---

## Jira Weaver integration

If you also use [Jira Weaver](https://github.com/hyukjin78/jira-weaver), run the command **Link Confluence Pages in Jira Notes** after syncing. It scans all Jira Weaver files and replaces bare Confluence URLs with `[[wiki-link]]`s pointing to the synced Confluence pages.

---

## Frontmatter reference

```yaml
---
confluence_id: "123456"
confluence_url: "https://acme.atlassian.net/wiki/spaces/DEV/pages/123456"
title: "Architecture Overview"
space: "DEV"
space_name: "Development"
author: "Alice"
created: "2025-01-15"
updated: "2025-04-01"
version: 3
labels:
  - architecture
  - backend
parent: "[[123400_engineering-hub]]"
---
```

---

## Commands

| Command | Description |
|---|---|
| Sync Pages | Incremental sync for all enabled profiles |
| Force Sync Pages (Overwrite All) | Re-download and overwrite every page |
| Open Sync Log | Open the sync statistics panel |
| Link Confluence Pages in Jira Notes | Replace Confluence URLs with wiki-links in Jira Weaver files |

---

## License

MIT
