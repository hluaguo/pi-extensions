/**
 * arXiv extension for Pi
 *
 * Read-only search against the official arXiv API.
 *
 * Sync rule: this tool never writes files. When a paper needs to be added to
 * an Obsidian note, the agent must use the default edit tool on the note file
 * so the change lands on disk as a normal file edit and Obsidian sync picks
 * it up.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const SYNC_NOTE =
	"This tool is read-only and never edits notes. To add a paper to an Obsidian note, the agent must use the default edit tool on the note file so the change lands on disk and Obsidian sync picks it up.";

function decodeEntities(s: string): string {
	return s
		.replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'");
}

function clean(s: string): string {
	return decodeEntities(s.replace(/\s+/g, " ")).trim();
}

function firstTag(xml: string, tag: string): string {
	const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
	return m ? clean(m[1]) : "";
}

interface ArxivEntry {
	id: string;
	date: string;
	title: string;
	authors: string[];
	abstract: string;
}

function parseFeed(xml: string): ArxivEntry[] {
	const entries: ArxivEntry[] = [];
	for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
		const e = m[1];
		const idMatch = firstTag(e, "id").match(/abs\/(\d{4}\.\d{4,5})(v\d+)?/);
		if (!idMatch) continue;
		entries.push({
			id: idMatch[1],
			date: firstTag(e, "published").slice(0, 10),
			title: firstTag(e, "title"),
			authors: [...e.matchAll(/<name>([^<]*)<\/name>/g)].map((a) => clean(a[1])),
			abstract: firstTag(e, "summary"),
		});
	}
	return entries;
}

function formatEntries(entries: ArxivEntry[], abstractChars: number): string {
	if (entries.length === 0) {
		return 'No results. Check the query syntax (e.g. all:"token budget" AND cat:cs.CV) or the IDs.';
	}
	return entries
		.map((e) => {
			const authors = e.authors.slice(0, 3).join(", ") + (e.authors.length > 3 ? ", et al." : "");
			let abs = e.abstract;
			if (abstractChars > 0 && abs.length > abstractChars) abs = abs.slice(0, abstractChars).trimEnd() + "...";
			const lines = [`${e.date} | ${e.id} | ${e.title}`, `    ${authors}${authors ? " | " : ""}https://arxiv.org/abs/${e.id}`];
			if (abs) lines.push(`    ${abs}`);
			return lines.join("\n");
		})
		.join("\n\n");
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "arxiv_search",
		label: "arXiv search",
		description:
			"Search arXiv via the official API and return formatted entries (date, id, title, authors, abstract snippet, abs link). " +
			'Provide `query` in arXiv API syntax, e.g. all:"optical compression" AND cat:cs.CV, ti:TexOCR, au:"Wei". ' +
			"Or provide `ids` (comma-separated arXiv IDs) to fetch metadata directly. " +
			SYNC_NOTE,
		parameters: Type.Object({
			query: Type.Optional(Type.String({ description: 'arXiv search query, e.g. all:"token budget" AND cat:cs.CV' })),
			ids: Type.Optional(Type.String({ description: "comma-separated arXiv IDs to look up directly, e.g. 2609.03181,2510.18234" })),
			max_results: Type.Optional(Type.Number({ description: "max entries to return (1-30, default 8)" })),
			sort_by: Type.Optional(
				Type.Union([Type.Literal("submittedDate"), Type.Literal("relevance"), Type.Literal("lastUpdatedDate")], {
					description: "sort field (default submittedDate)",
				}),
			),
			sort_order: Type.Optional(
				Type.Union([Type.Literal("descending"), Type.Literal("ascending")], { description: "sort order (default descending)" }),
			),
			abstract_chars: Type.Optional(Type.Number({ description: "abstract snippet length, 0 for full text (default 280)" })),
		}),
		annotations: { readOnlyHint: true },
		async execute(_toolCallId, params) {
			if (!params.query && !params.ids) {
				return { content: [{ type: "text", text: "Error: provide either `query` or `ids`." }] };
			}
			const maxResults = Math.max(1, Math.min(30, params.max_results ?? 8));
			const abstractChars = Math.max(0, Math.min(2000, params.abstract_chars ?? 280));
			const url = new URL("http://export.arxiv.org/api/query");
			url.searchParams.set("start", "0");
			url.searchParams.set("max_results", String(maxResults));
			if (params.ids) {
				url.searchParams.set("id_list", params.ids);
			} else {
				url.searchParams.set("search_query", params.query!);
				url.searchParams.set("sortBy", params.sort_by ?? "submittedDate");
				url.searchParams.set("sortOrder", params.sort_order ?? "descending");
			}
			let xml: string;
			try {
				const res = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { "User-Agent": "pi-arxiv-extension/0.2" } });
				if (!res.ok) return { content: [{ type: "text", text: `Error: arXiv API returned HTTP ${res.status}` }] };
				xml = await res.text();
			} catch (err) {
				return { content: [{ type: "text", text: `Error: arXiv API request failed: ${err instanceof Error ? err.message : String(err)}` }] };
			}
			const entries = parseFeed(xml);
			return {
				content: [{ type: "text", text: `${entries.length} result(s)\n\n${formatEntries(entries, abstractChars)}` }],
			};
		},
	});
}
