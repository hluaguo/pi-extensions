# pi-extensions

A hub of custom extensions for [Pi](https://github.com/earendil-works/pi-coding-agent). Each extension is independent; install only the ones you want into any project, and sync the hub across machines with git.

## Extensions

### arxiv

One tool, `arxiv_search`. Queries the official arXiv API.

- `query`: arXiv search syntax, e.g. `all:"token budget" AND cat:cs.CV`, `ti:TexOCR`, `au:"Wei"`
- `ids`: comma-separated arXiv IDs for direct lookup, e.g. `2609.03181,2510.18234`
- `max_results` (default 8), `sort_by`, `sort_order`, `abstract_chars` (0 for the full abstract)

Returns date, id, title, authors, an abstract snippet, and the abs link for each entry.

### obsidian

Two read-only tools over an Obsidian vault.

- `obsidian_list`: lists markdown notes under a folder or the whole vault, one relative path per line
- `obsidian_search`: fuzzy keyword search over file names and contents (case-insensitive; multiple words must all match). Returns note paths and file names only

### slide-condenser

Turn a course's lecture PDFs and tutorial sheets into one purified, ADHD-friendly Typst revision
deck, with optional [archify](https://github.com/tt-a1i/archify) diagrams. Four tools plus a
`/condense` command.

- `condense_scaffold` — create the repo layout (`slides/`, `diagrams/`, `lectures/`, `tutorials/`) and
  write the Typst template to `slides/<course>-revision.typ`
- `condense_extract` — extract text from PDFs (`pdftotext -layout`) and DOCX so the agent can read the
  whole course, with page counts
- `condense_verify` — compile the deck and prove no slide overflowed (pages must equal
  `1 + #slide() + #divider()`)
- `condense_diagram` — render an archify HTML diagram to a cropped PNG using headless Firefox (works
  without Chrome), ready to embed with the template's `diagram(...)` helper

`/condense <folder>` starts the workflow: purify the material, write the deck, add diagrams, verify,
and commit to a private repo. The playbook bakes in the purification rules, the ADHD design contract
(one idea per slide, a takeaway on every concept slide, single-row formulas, color per section), and
the requirement to credit archify.

Requirements: `typst`, `pdftotext`/`pdfinfo` (poppler), `firefox`, ImageMagick (`magick`). For the
optional diagram step:

```sh
npx skills add tt-a1i/archify
```

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

Clone the hub somewhere stable:

```sh
git clone https://github.com/hluaguo/pi-extensions.git ~/project/pi-extensions
cd ~/project/pi-extensions
```

See what the hub holds, then install selectively into a project:

```sh
./install.sh --list
./install.sh /path/to/your/project arxiv        # just arxiv
./install.sh /path/to/your/project arxiv obsidian
./install.sh /path/to/your/project --all        # everything
```

Each extension is symlinked from `extensions/<name>.ts` into the project's `.pi/extensions/`. Copying the files works too; you just lose the single source of truth.

After installing, run `/reload` inside Pi. The first time a project loads extensions, Pi asks you to trust the project.

## Sync rule for Obsidian

These tools never write files. When a note needs editing, the agent uses the default edit tool on the note file, so the change lands on disk as a normal file edit and Obsidian sync picks it up. The rule is baked into every tool description.

## Sync across machines

```sh
git pull
./install.sh /path/to/another/project arxiv
```

## Adding an extension

Drop a new `<name>.ts` into `extensions/`, following the existing files as a template (default-export factory that receives the Pi `ExtensionAPI`). It shows up in `./install.sh --list` immediately.
