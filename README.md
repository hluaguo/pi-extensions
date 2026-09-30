# pi-extensions

Custom extensions for [Pi](https://github.com/earendil-works/pi-coding-agent), kept in one repo so they can be symlinked into any project and synced across machines.

## Extensions

### arxiv.ts

One tool, `arxiv_search`. Queries the official arXiv API.

- `query`: arXiv search syntax, e.g. `all:"token budget" AND cat:cs.CV`, `ti:TexOCR`, `au:"Wei"`
- `ids`: comma-separated arXiv IDs for direct lookup, e.g. `2609.03181,2510.18234`
- `max_results` (default 8), `sort_by`, `sort_order`, `abstract_chars` (0 for the full abstract)

Returns date, id, title, authors, an abstract snippet, and the abs link for each entry.

### obsidian.ts

Two read-only tools over an Obsidian vault.

- `obsidian_list`: lists markdown notes under a folder or the whole vault, one relative path per line
- `obsidian_search`: fuzzy keyword search over file names and contents (case-insensitive; multiple words must all match). Returns note paths and file names only

## Vault configuration

The vault location is resolved in this order:

1. the `path` parameter, per call
2. project config: `<project>/.pi/obsidian.json`
3. global config: `~/.pi/agent/obsidian.json`

Nothing is configured on first use. When a tool runs with no vault set, it returns an error that instructs the agent to ask you where the vault is, then save the answer with `save_vault` (scope `global` by default, or `project`). Example after you answer:

```
obsidian_list with save_vault="/Users/you/Obsidian", save_scope="global"
```

The config file written looks like:

```json
{ "vault": "/Users/you/Obsidian" }
```

## Install

Clone the repo somewhere stable, then link the extensions into a project. Pi loads project extensions from `.pi/extensions/`:

```sh
git clone <this repo> ~/project/pi-extensions
cd /path/to/your/project
mkdir -p .pi/extensions
ln -s ~/project/pi-extensions/arxiv.ts .pi/extensions/arxiv.ts
ln -s ~/project/pi-extensions/obsidian.ts .pi/extensions/obsidian.ts
```

`install.sh` does the linking for you:

```sh
./install.sh /path/to/your/project
```

Copying the files works too; you just lose the single source of truth.

After installing, run `/reload` inside Pi. The first time a project loads extensions, Pi asks you to trust the project.

## Sync rule for Obsidian

These tools never write files. When a note needs editing, the agent uses the default edit tool on the note file, so the change lands on disk as a normal file edit and Obsidian sync picks it up. The rule is baked into every tool description.

## Sync across machines

```sh
git pull
./install.sh /path/to/another/project
```
