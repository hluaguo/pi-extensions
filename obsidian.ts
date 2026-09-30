/**
 * Obsidian extension for Pi
 *
 * Read-only vault tools:
 * - obsidian_list:   list markdown notes under a folder or the whole vault
 * - obsidian_search: fuzzy keyword search, returns note paths only
 *
 * Vault resolution order:
 * 1. `path` param (per call, not persisted)
 * 2. project config  <project>/.pi/obsidian.json
 * 3. global config   ~/.pi/agent/obsidian.json
 * 4. none: the tool returns an error instructing the agent to ask the user
 *    for the vault location and save it via `save_vault`.
 *
 * Sync rule: these tools never edit notes. When an Obsidian note needs
 * editing, the agent must use the default edit tool on the note file so the
 * change lands on disk as a normal file edit and Obsidian sync picks it up.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { homedir } from "node:os";

const SYNC_NOTE =
	"This tool is read-only and never edits notes. To change an Obsidian note, the agent must use the default edit tool on the note file so the change lands on disk and Obsidian sync picks it up.";

const NO_VAULT_INSTRUCTIONS =
	"No Obsidian vault configured. Ask the user where their vault is (do not guess), then call this tool again with `save_vault` set to that path and `save_scope` set to \"global\" (remember for all projects, saved to ~/.pi/agent/obsidian.json) or \"project\" (this project only, saved to <project>/.pi/obsidian.json).";

function projectConfigPath(): string {
	return join(process.cwd(), ".pi", "obsidian.json");
}

function globalConfigPath(): string {
	return join(homedir(), ".pi", "agent", "obsidian.json");
}

async function readConfig(file: string): Promise<string | undefined> {
	try {
		const raw = JSON.parse(await readFile(file, "utf-8"));
		return typeof raw?.vault === "string" && raw.vault.trim() ? resolve(raw.vault) : undefined;
	} catch {
		return undefined;
	}
}

async function writeConfig(file: string, vault: string): Promise<void> {
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, JSON.stringify({ vault }, null, 2) + "\n", "utf-8");
}

async function resolveVault(explicit?: string): Promise<{ root?: string; error?: string }> {
	if (explicit) return { root: resolve(explicit) };
	const project = await readConfig(projectConfigPath());
	if (project) return { root: project };
	const global = await readConfig(globalConfigPath());
	if (global) return { root: global };
	return { error: `${NO_VAULT_INSTRUCTIONS}\n(Looked in ${projectConfigPath()} and ${globalConfigPath()}.)` };
}

async function collectMarkdownFiles(root: string, limit = 5000): Promise<string[]> {
	const files: string[] = [];
	async function walk(dir: string): Promise<void> {
		if (files.length >= limit) return;
		let dirents;
		try {
			dirents = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const d of dirents) {
			if (files.length >= limit) return;
			if (d.name.startsWith(".")) continue;
			const p = join(dir, d.name);
			if (d.isDirectory()) {
				await walk(p);
			} else if (d.isFile() && /\.md$/i.test(d.name)) {
				files.push(p);
			}
		}
	}
	await walk(root);
	return files;
}

function termsMatch(needleTerms: string[], haystackLower: string): boolean {
	return needleTerms.every((t) => haystackLower.includes(t));
}

const VaultParams = {
	path: Type.Optional(Type.String({ description: "folder to use for this call instead of the configured vault" })),
	save_vault: Type.Optional(
		Type.String({ description: "save this absolute path as the default vault, after asking the user for it" }),
	),
	save_scope: Type.Optional(
		Type.Union([Type.Literal("global"), Type.Literal("project")], {
			description: 'where to save the vault: "global" (~/.pi/agent/obsidian.json) or "project" (<project>/.pi/obsidian.json); default global',
		}),
	),
};

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "obsidian_list",
		label: "Obsidian note list",
		description:
			"List markdown notes under a folder or the whole vault, one relative path per line. " +
			"If no vault is configured, returns an error telling the agent to ask the user for the vault location and save it with `save_vault`. " +
			SYNC_NOTE,
		parameters: Type.Object({
			...VaultParams,
			max_results: Type.Optional(Type.Number({ description: "max notes to report (default 200)" })),
		}),
		annotations: { readOnlyHint: true },
		async execute(_toolCallId, params) {
			if (params.save_vault) {
				const file = params.save_scope === "project" ? projectConfigPath() : globalConfigPath();
				await writeConfig(file, resolve(params.save_vault));
			}
			const { root, error } = await resolveVault(params.path);
			if (!root) return { content: [{ type: "text", text: `Error: ${error}` }] };
			const files = await collectMarkdownFiles(root);
			if (files.length === 0) {
				return { content: [{ type: "text", text: `No markdown files found under ${root}.` }] };
			}
			const maxResults = Math.max(1, Math.min(1000, params.max_results ?? 200));
			const shown = files.slice(0, maxResults).map((f) => relative(root, f));
			const footer = files.length > shown.length ? `\n\n(${files.length - shown.length} more; raise max_results to see them)` : "";
			return {
				content: [{ type: "text", text: `${files.length} note(s) under ${root}\n\n${shown.join("\n")}${footer}` }],
			};
		},
	});

	pi.registerTool({
		name: "obsidian_search",
		label: "Obsidian fuzzy search",
		description:
			"Fuzzy keyword search over note file names and contents (case-insensitive; multiple words must all match). Returns note paths and file names only, no snippets. " +
			"If no vault is configured, returns an error telling the agent to ask the user for the vault location and save it with `save_vault`. " +
			SYNC_NOTE,
		parameters: Type.Object({
			...VaultParams,
			keyword: Type.String({ description: "keyword or space-separated keywords (all must match), case-insensitive" }),
			max_results: Type.Optional(Type.Number({ description: "max notes to report (default 50)" })),
		}),
		annotations: { readOnlyHint: true },
		async execute(_toolCallId, params) {
			if (params.save_vault) {
				const file = params.save_scope === "project" ? projectConfigPath() : globalConfigPath();
				await writeConfig(file, resolve(params.save_vault));
			}
			const { root, error } = await resolveVault(params.path);
			if (!root) return { content: [{ type: "text", text: `Error: ${error}` }] };
			const files = await collectMarkdownFiles(root);
			if (files.length === 0) {
				return { content: [{ type: "text", text: `No markdown files found under ${root}.` }] };
			}
			const terms = params.keyword.toLowerCase().split(/\s+/).filter(Boolean);
			if (terms.length === 0) {
				return { content: [{ type: "text", text: "Error: keyword is empty." }] };
			}
			const maxResults = Math.max(1, Math.min(500, params.max_results ?? 50));
			const hits: string[] = [];
			for (const file of files) {
				let content: string;
				try {
					content = await readFile(file, "utf-8");
				} catch {
					continue;
				}
				const nameHit = termsMatch(terms, file.toLowerCase());
				const contentHit = !nameHit && termsMatch(terms, content.toLowerCase());
				if (nameHit || contentHit) hits.push(relative(root, file));
				if (hits.length >= maxResults) break;
			}
			return {
				content: [
					{
						type: "text",
						text:
							hits.length > 0
								? `${hits.length} note(s) matching "${params.keyword}" under ${root}\n\n${hits.join("\n")}`
								: `No notes matching "${params.keyword}" under ${root}.`,
					},
				],
			};
		},
	});
}
