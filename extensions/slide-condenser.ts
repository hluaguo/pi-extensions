/**
 * slide-condenser — Pi extension
 *
 * Condense a course's lecture PDFs and tutorial sheets into ONE purified,
 * ADHD-friendly Typst revision deck, with optional archify diagrams.
 *
 * Tools
 *   condense_scaffold  create the repo layout and the Typst template
 *   condense_extract   extract text from PDFs / DOCX so the agent can read it
 *   condense_verify    compile the deck and prove no slide overflowed
 *   condense_diagram   render an archify HTML diagram to a cropped PNG
 *
 * Command
 *   /condense <folder>  start the workflow against a folder of PDFs
 *
 * The workflow itself (purification rules, ADHD design contract, archify use)
 * is in the playbook the command sends. Nothing here starts a process at load
 * time; the tools run commands on demand.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const exec = promisify(execFile);

// ---------------------------------------------------------------------------
// Typst starter template (theme + helpers + scaffolding). Rendered here so the
// extension stays a single file.
// ---------------------------------------------------------------------------
const TEMPLATE = `// ============================================================
//  <COURSE> — Combined Revision Deck
//  Condensed from the lecture slides and tutorials.
//  Start here: fill in the title, sections, and slides.
// ============================================================

// ---------- Theme (one accent per section) ----------
#let c-a = rgb("#2563eb")   // section A — blue
#let c-b = rgb("#7c3aed")   // section B — violet
#let c-c = rgb("#0d9488")   // section C — teal
#let c-d = rgb("#ea580c")   // section D — orange
#let c-tut = rgb("#db2777") // tutorials  — pink
#let ink   = rgb("#0f172a")
#let muted = rgb("#64748b")
#let bg    = rgb("#f8fafc")
#let line-c = rgb("#cbd5e1")
#let gold  = rgb("#eab308")
#let red   = rgb("#ef4444")

#let section-state = state("sec", "COURSE")

// ---------- Page ----------
#set page(
  paper: "presentation-16-9",
  margin: (x: 2.3em, y: 1.7em),
  fill: bg,
  header: context {
    let s = section-state.get()
    set text(size: 9pt, fill: muted)
    grid(
      columns: (1fr, auto),
      align(left + horizon)[#s],
      align(right + horizon)[COURSE · Combined Revision],
    )
    v(-0.7em)
    line(length: 100%, stroke: 0.6pt + line-c)
  },
  footer: context {
    set text(size: 9pt, fill: rgb("#94a3b8"))
    align(right)[#counter(page).display("1")]
  },
)

// ---------- Type & math ----------
// Base 18pt fills the slide. Dense slides override with #set text(size: 11pt–13pt).
#set text(font: ("Noto Sans", "Noto Color Emoji"), size: 18pt, fill: ink)
#set math.frac(style: "horizontal")   // a/b on one row — never stacked
#set par(justify: false, leading: 0.72em)
#set list(spacing: 0.52em, indent: 0.9em)
#set enum(spacing: 0.52em)

// ---------- Helpers ----------
#let slide(title, color: c-a, body, last: false) = {
  block(width: 100%, {
    text(font: "Montserrat", weight: "bold", size: 22pt, fill: color, title)
    v(-0.55em)
    line(length: 100%, stroke: 1.4pt + color.transparentize(50%))
  })
  v(0.35em)
  body
  if not last { pagebreak() }
}

#let fbox(color: c-a, body) = block(
  width: 100%,
  fill: color.transparentize(93%),
  stroke: (left: 3pt + color),
  inset: (left: 1em, right: 0.8em, top: 0.55em, bottom: 0.55em),
  radius: (right: 0.4em),
  body,
)

#let take(body) = block(
  width: 100%,
  fill: rgb("#fefce8"),
  stroke: (left: 3pt + gold),
  inset: (left: 1em, right: 0.8em, top: 0.5em, bottom: 0.5em),
  radius: (right: 0.4em),
  [🎯 *In one line:* #body],
)

#let trap(body) = block(
  width: 100%,
  fill: rgb("#fef2f2"),
  stroke: (left: 3pt + red),
  inset: (left: 1em, right: 0.8em, top: 0.5em, bottom: 0.5em),
  radius: (right: 0.4em),
  [⚠️ #body],
)

#let cols(a, b, gutter: 1.2em) = grid(
  columns: (1fr, 1fr),
  column-gutter: gutter,
  a,
  b,
)

#let pill(label, color) = box(
  fill: color.transparentize(88%),
  stroke: 0.7pt + color.transparentize(55%),
  inset: (x: 0.55em, y: 0.15em),
  radius: 1em,
  text(fill: color, weight: "bold", size: 10pt, label),
)

// Embedded diagram image. Omit \`h\` to scale to the content width.
#let diagram(path, h: none) = align(center)[
  #if h == none [#image(path, width: 100%)] else [#image(path, height: h)]
]

#let divider(num, title, subtitle, color) = {
  section-state.update(title)
  pagebreak(weak: true)
  [
    #v(2.2em)
    #text(font: "Montserrat", weight: "bold", size: 50pt, fill: color)[#num]
    #v(-0.3em)
    #text(font: "Montserrat", weight: "bold", size: 28pt, fill: ink)[#title]
    #v(0.35em)
    #line(length: 34%, stroke: 2.2pt + color)
    #v(0.5em)
    #text(size: 12.5pt, fill: muted)[#subtitle]
  ]
  pagebreak()
}

#let ftab(color: c-a, header, rows) = table(
  columns: header.len(),
  inset: (x: 6pt, y: 4pt),
  stroke: 0.5pt + line-c,
  align: center + horizon,
  fill: (_, y) => if y == 0 { color.transparentize(88%) } else { white },
  table.header(..header.map(h => text(weight: "bold", size: 10pt)[#h])),
  ..rows.map(r => r.map(c => text(size: 10pt)[#c])).flatten(),
)

// ============================================================
//  TITLE
// ============================================================
#{
  set align(center)
  v(2.6em)
  text(font: "Montserrat", weight: "bold", size: 36pt, fill: c-a)[COURSE TITLE]
  v(0.25em)
  text(font: "Montserrat", weight: "bold", size: 20pt, fill: ink)[Combined Revision Deck]
  v(0.6em)
  line(length: 38%, stroke: 2pt + c-a)
  v(0.8em)
  text(size: 13pt, fill: muted)[
    Lectures … — condensed, calculation-focused, ADHD-friendly.\\
    Built from the official slides and tutorials.
  ]
}
#pagebreak()

// ============================================================
//  FRONT REFERENCE — units, constants, master formulas
// ============================================================
#slide("📏 Units, constants & magic numbers", color: c-a)[
  #set text(size: 14pt)
  #set list(spacing: 0.5em)
  #cols(
    fbox(color: c-a)[
      *Rates* — 1 kbps $= 10^3$ bps · 1 Mbps $= 10^6$ bps · 1 Gbps $= 10^9$ bps
      *Data* — 1 byte = *8 bits* · 1 MB $= 8 times 10^6$ bits
      *Time* — 1 s $= 10^3$ ms $= 10^6$ µs
      *Speed* — 1 km $= 10^3$ m · prop $approx 2 times 10^8$ m/s
    ],
    fbox(color: c-a)[
      *Shortcuts* — at 1 Mbps, 1 bit = *1 µs* · at 1 Gbps, 1 bit = *1 ns*
      *Constants* — …
      *Ports* — HTTP 80 · SMTP 25 · DNS 53
    ],
  )
]

#slide("📐 Master formula sheet", color: c-a)[
  #set text(size: 13pt)
  #set list(spacing: 0.4em)
  #cols(
    fbox(color: c-a)[
      *Section A*
      - $d_"trans" = L/R$ · $d_"prop" = d/s$
      - …
    ],
    fbox(color: c-a)[
      *Section B*
      - …
    ],
  )
]

// ============================================================
//  ROADMAP
// ============================================================
#slide("Roadmap", color: c-a)[
  #v(0.3em)
  #grid(
    columns: (auto, 1fr),
    row-gutter: 0.7em,
    column-gutter: 0.8em,
    pill("01", c-a), [*Section A* — …],
    pill("02", c-b), [*Section B* — …],
    pill("03", c-c), [*Section C* — …],
    pill("T", c-tut), [*Tutorials* — worked problems],
  )
  #v(0.8em)
  #take[…]
]

// ============================================================
//  SECTION A  (replace with real content)
// ============================================================
#divider("01", "Section A", "one-line description of the section", c-a)

#slide("Topic name", color: c-a)[
  #cols(
    [ - short bullet with a *key term* · - another ],
    [ - second column · - … ],
  )
  #v(0.4em)
  #fbox(color: c-a)[Formula or definition, on one row.]
  #v(0.3em)
  #take[The single most important idea of this slide.]
]

// ---------- Add one slide per idea; split when in doubt ----------

// ============================================================
//  TUTORIALS  (questions + answers + why)
// ============================================================
#divider("T", "Tutorials", "worked problems from the tutorial sheets", c-tut)

#slide("🧮 T1 · Topic", color: c-tut)[
  #set text(size: 12pt)
  *T1.1 — setup.* *Q:* the brief question?
  - answer with numbers
  #v(0.3em)
  #text(fill: muted)[Why: the one-line reason behind the answer.]
]

// ============================================================
//  CHEAT SHEET  (last slide uses \`last: true\`)
// ============================================================
#divider("★", "Formula Cheat Sheet", "every calculation in one place", c-a)

#slide("📐 Cheat sheet", color: c-a, last: true)[
  #set text(size: 11.5pt)
  #set list(spacing: 0.6em)
  #fbox(color: c-a)[
    - formula · formula · formula
  ]
  #v(0.6em)
  #take[Cover the page, write each formula from memory, then check.]
]
`;

const PLAYBOOK = `You are condensing a course into ONE purified, ADHD-friendly revision deck written in Typst.

Input: a folder of lecture PDFs and tutorial PDFs/DOCX.
Output: a git-friendly repo laid out as:
  slides/<course>-revision.typ   slides/<course>-revision.pdf   slides/assets/
  diagrams/<slug>.html   diagrams/src/<slug>.json
  lectures/   tutorials/   README.md   .gitignore

Method:
1. condense_extract the folder, then read ALL of the extracted text before writing anything.
2. Purify. DROP agenda slides, "any questions?" slides, title-only pages, repeated boilerplate,
   marketing, and near-duplicates. KEEP and compress every definition, formula, worked numeric
   answer, comparison, and exam-relevant fact. MERGE the same concept taught in two decks into one
   canonical slide.
3. Outline: title → units/constants & magic numbers → master formula sheet → roadmap → one colored
   section per lecture → tutorials → formula cheat sheet.
4. Write the deck from the template condense_scaffold wrote. ADHD rules are HARD requirements:
   - one idea per slide; split when in doubt;
   - a take[...] "In one line" takeaway on every concept slide;
   - short bullets, bold only the key term; no walls of text;
   - formulas in fbox and on ONE row: inline math only (\`$x$\`, never \`$ x $\`),
     \`#set math.frac(style: "horizontal")\`, \`attach(Sigma, tr: n, br: i=1)\` for sums, and
     \`C(n,k)\` instead of \`binom(n,k)\`;
   - classic mistakes in trap[...];
   - one accent color per section, with the running header naming the section;
   - fill the page but never overflow.
5. Diagrams: use the archify skill (\`npx skills add tt-a1i/archify\`). Choose the type by the concept
   (sequence for protocols, architecture for components, dataflow for pipelines, lifecycle for
   states). Author the candidate JSON, finalize it, then render a light-theme PNG with
   condense_diagram and embed it with the template's \`diagram(...)\` helper. Credit archify by name
   in the README and keep the interactive HTML under diagrams/.
6. Tutorial slides: state each question briefly (\`*Q:* ...\`), give the answer with numbers, then a
   one-line why.
7. condense_verify. Page count MUST equal 1 (title) + #slide() + #divider(). Fix every overflow by
   splitting the slide or lowering its \`#set text(size: ...)\`.
8. Write the README, then commit to a private repo. Include the original PDFs but note that they
   remain their authors' copyright (personal study only). Never commit vendored skills.`;

const PLAYBOOK_HINT =
  "Tip: install archify once with `npx skills add tt-a1i/archify`; the deck credits it in the README.";

async function run(cmd: string, args: string[], opts: { cwd?: string; timeout?: number } = {}): Promise<string> {
  const { stdout } = await exec(cmd, args, {
    cwd: opts.cwd,
    timeout: opts.timeout ?? 180_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function findFiles(root: string, test: (name: string) => boolean, limit = 5000): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    if (out.length >= limit) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= limit) return;
      if (e.name.startsWith(".")) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && test(e.name)) out.push(p);
    }
  }
  await walk(root);
  return out;
}

function stripXml(xml: string): string {
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

async function typstBin(): Promise<string> {
  try {
    await exec("typst", ["--version"], { timeout: 20_000 });
    return "typst";
  } catch {
    const local = join(process.env.HOME ?? "", ".local", "bin", "typst");
    if (await exists(local)) return local;
    throw new Error("typst not found on PATH or ~/.local/bin/typst");
  }
}

export default function slideCondenser(pi: ExtensionAPI) {
  // --- scaffold -------------------------------------------------------------
  pi.registerTool({
    name: "condense_scaffold",
    label: "Condense: scaffold",
    description:
      "Create the slide-condenser repo layout and write a Typst revision-deck template to " +
      "slides/<course>-revision.typ. Use this first; then replace the placeholders with real content. " +
      "Never overwrites an existing deck.",
    parameters: Type.Object({
      course: Type.String({ description: "course code or slug, e.g. cs3201 (used in file names)" }),
      root: Type.Optional(Type.String({ description: "project root (default: current directory)" })),
      title: Type.Optional(Type.String({ description: "human title for the title slide" })),
    }),
    async execute(_id, params) {
      const root = resolve(params.root ?? process.cwd());
      const course = params.course.trim();
      if (!course) return { content: [{ type: "text", text: "Error: `course` is required." }], details: undefined };
      for (const d of ["slides/assets", "diagrams/src", "lectures", "tutorials"]) {
        await mkdir(join(root, d), { recursive: true });
      }
      const typPath = join(root, "slides", `${course}-revision.typ`);
      if (await exists(typPath)) {
        return {
          content: [{ type: "text", text: `Deck already exists, not overwritten: ${typPath}` }],
          details: { typPath, created: false },
        };
      }
      const title = (params.title ?? course).toString();
      const body = TEMPLATE.replaceAll("COURSE TITLE", title).replaceAll("COURSE", course.toUpperCase());
      await writeFile(typPath, body, "utf-8");
      return {
        content: [
          {
            type: "text",
            text:
              `Scaffolded under ${root}\n` +
              `  deck: ${typPath}\n` +
              `  next: condense_extract the lecture/tutorial folders, read the text, then edit the deck.`,
          },
        ],
        details: { root, typPath, created: true },
      };
    },
  });

  // --- extract --------------------------------------------------------------
  pi.registerTool({
    name: "condense_extract",
    label: "Condense: extract text",
    description:
      "Extract plain text from every PDF (via pdftotext -layout) and DOCX under a folder, so the " +
      "agent can read the whole course. Returns each source file, its page count, and the .txt path.",
    parameters: Type.Object({
      input: Type.String({ description: "folder containing lecture/tutorial PDFs (and DOCX)" }),
      out: Type.Optional(Type.String({ description: "output folder (default: a temp dir)" })),
    }),
    annotations: { readOnlyHint: true },
    async execute(_id, params) {
      const inDir = resolve(params.input);
      if (!(await exists(inDir))) {
        return { content: [{ type: "text", text: `Error: not found: ${inDir}` }], details: undefined };
      }
      const outDir = resolve(params.out ?? join(tmpdir(), `slide-condenser-extract-${Date.now()}`));
      await mkdir(outDir, { recursive: true });

      const lines: string[] = [];
      const rows: Array<{ src: string; pages?: number; txt: string }> = [];

      const pdfs = await findFiles(inDir, (n) => n.toLowerCase().endsWith(".pdf"));
      for (const pdf of pdfs) {
        const txt = join(outDir, `${basename(pdf)}.txt`);
        try {
          await run("pdftotext", ["-layout", pdf, txt]);
        } catch (err) {
          lines.push(`FAIL pdf  ${basename(pdf)}  (${err instanceof Error ? err.message : String(err)})`);
          continue;
        }
        let pages: number | undefined;
        try {
          const info = await run("pdfinfo", [pdf]);
          const m = info.match(/^Pages:\s+(\d+)/m);
          if (m) pages = Number(m[1]);
        } catch {
          /* pdfinfo optional */
        }
        rows.push({ src: pdf, pages, txt });
        lines.push(`pdf  ${String(pages ?? "?").padStart(3)}p  ${basename(pdf)}`);
      }

      const docxs = await findFiles(inDir, (n) => n.toLowerCase().endsWith(".docx"));
      for (const docx of docxs) {
        const txt = join(outDir, `${basename(docx)}.txt`);
        try {
          const xml = await run("unzip", ["-p", docx, "word/document.xml"]);
          await writeFile(txt, stripXml(xml), "utf-8");
        } catch (err) {
          lines.push(`FAIL docx ${basename(docx)}  (${err instanceof Error ? err.message : String(err)})`);
          continue;
        }
        rows.push({ src: docx, txt });
        lines.push(`docx       ${basename(docx)}`);
      }

      return {
        content: [
          {
            type: "text",
            text:
              `Extracted ${rows.length} file(s) to ${outDir}\n\n${lines.join("\n")}\n\n` +
              `Read every .txt before writing the deck.`,
          },
        ],
        details: { outDir, files: rows },
      };
    },
  });

  // --- verify ---------------------------------------------------------------
  pi.registerTool({
    name: "condense_verify",
    label: "Condense: verify deck",
    description:
      "Compile a Typst revision deck and prove no slide overflowed. Expected pages = 1 (title) + " +
      "#slide() + #divider(); a larger actual count means a slide split across pages.",
    parameters: Type.Object({
      typ: Type.String({ description: "path to the .typ deck" }),
      pdf: Type.Optional(Type.String({ description: "output .pdf path (default: same name as the .typ)" })),
    }),
    annotations: { readOnlyHint: false },
    async execute(_id, params) {
      const typPath = resolve(params.typ);
      const pdfPath = params.pdf ? resolve(params.pdf) : typPath.replace(/\.typ$/i, ".pdf");
      if (!(await exists(typPath))) {
        return { content: [{ type: "text", text: `Error: not found: ${typPath}` }], details: undefined };
      }
      const bin = await typstBin();
      try {
        await run(bin, ["compile", typPath, pdfPath], { timeout: 300_000 });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Compile failed:\n${msg}` }], details: { typPath }, isError: true };
      }
      const src = await readFile(typPath, "utf-8");
      const slides = (src.match(/^#slide\(/gm) ?? []).length;
      const dividers = (src.match(/^#divider\(/gm) ?? []).length;
      const expected = 1 + slides + dividers;
      let actual = -1;
      try {
        const info = await run("pdfinfo", [pdfPath]);
        const m = info.match(/^Pages:\s+(\d+)/m);
        if (m) actual = Number(m[1]);
      } catch {
        return {
          content: [{ type: "text", text: `Compiled ${pdfPath}, but pdfinfo is unavailable to count pages.` }],
          details: { pdfPath, expected },
        };
      }
      const ok = actual === expected;
      return {
        content: [
          {
            type: "text",
            text: ok
              ? `OK: ${actual} pages = 1 title + ${slides} slides + ${dividers} dividers. No overflow.`
              : `OVERFLOW: ${actual} pages, expected ${expected} (1 + ${slides} + ${dividers}). ` +
                `${actual - expected} slide(s) split. Split the offending slide, lower its ` +
                `#set text(size: ...), or trim content, then re-run.`,
          },
        ],
        details: { pdfPath, actual, expected, slides, dividers, ok },
        isError: !ok,
      };
    },
  });

  // --- diagram --------------------------------------------------------------
  pi.registerTool({
    name: "condense_diagram",
    label: "Condense: render diagram",
    description:
      "Render an archify HTML diagram to a cropped PNG for embedding in the deck. Uses headless " +
      "Firefox (so it works without Chrome) with ?embed=1 to drop the viewer chrome, then trims " +
      "the dotted background. Regenerate the archify HTML with the archify skill first.",
    parameters: Type.Object({
      html: Type.String({ description: "path to the archify HTML diagram" }),
      out: Type.String({ description: "output PNG path (put it under slides/assets/)" }),
      theme: Type.Optional(Type.Union([Type.Literal("light"), Type.Literal("dark")], { description: "theme (default light)" })),
      width: Type.Optional(Type.Number({ description: "viewport width in px (default 2400)" })),
      height: Type.Optional(Type.Number({ description: "viewport height in px (default 2400)" })),
      pad: Type.Optional(Type.Number({ description: "crop padding in px (default 34)" })),
    }),
    annotations: { readOnlyHint: false },
    async execute(_id, params) {
      const htmlPath = resolve(params.html);
      const outPath = resolve(params.out);
      if (!(await exists(htmlPath))) {
        return { content: [{ type: "text", text: `Error: not found: ${htmlPath}` }], details: undefined };
      }
      await mkdir(dirname(outPath), { recursive: true });
      const firefox = process.env.SLIDE_CONDENSER_FIREFOX ?? "firefox";
      const profile = join(tmpdir(), `slide-condenser-ff-${process.pid}`);
      await mkdir(profile, { recursive: true });
      const raw = join(tmpdir(), `slide-condenser-raw-${Date.now()}.png`);
      const theme = params.theme ?? "light";
      const w = Math.max(600, Math.round(params.width ?? 2400));
      const h = Math.max(600, Math.round(params.height ?? 2400));
      const url = `${pathToFileURL(htmlPath).href}?embed=1&theme=${theme}`;
      try {
        await run(
          firefox,
          [
            "--headless",
            "--no-remote",
            "--profile",
            profile,
            "--window-size",
            `${w},${h}`,
            "--screenshot",
            raw,
            url,
          ],
          { timeout: 180_000 },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Firefox render failed (${msg}). Set SLIDE_CONDENSER_FIREFOX if needed.` }],
          details: { htmlPath },
          isError: true,
        };
      }
      const pad = Math.max(0, Math.round(params.pad ?? 34));
      try {
        const bbox = (await run("magick", [raw, "-colorspace", "Gray", "-threshold", "85%", "-format", "%@", "info:"])).trim();
        const m = bbox.match(/^(\d+)x(\d+)\+(\d+)\+(\d+)$/);
        if (!m) throw new Error(`unexpected bbox: ${bbox}`);
        const [, bw, bh, bx, by] = m.map(Number);
        const x = Math.max(0, bx - pad);
        const y = Math.max(0, by - pad);
        const cw = bw + 2 * pad;
        const ch = bh + 2 * pad;
        await run("magick", [raw, "-crop", `${cw}x${ch}+${x}+${y}`, "+repage", outPath], { timeout: 120_000 });
        return {
          content: [
            {
              type: "text",
              text:
                `Rendered ${outPath} (${cw}x${ch}, aspect ${(cw / ch).toFixed(3)}).\n` +
                `Embed it with: #diagram("assets/${basename(outPath)}", h: 11cm)`,
            },
          ],
          details: { outPath, width: cw, height: ch },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Crop failed (${msg}); raw render kept at ${raw}` }], details: { raw }, isError: true };
      }
    },
  });

  // --- command --------------------------------------------------------------
  pi.registerCommand("condense", {
    description: "Condense lecture PDFs + tutorials into one ADHD-friendly Typst revision deck",
    handler: async (args, ctx) => {
      const target = args.trim();
      if (!target) {
        ctx.ui.notify("Usage: /condense <folder-with-lectures-and-tutorials>", "warning");
        return;
      }
      const message = `${PLAYBOOK}\n\nTarget folder: ${resolve(target)}\n\n${PLAYBOOK_HINT}\n\nStart with condense_scaffold, then condense_extract.`;
      if (ctx.isIdle()) {
        pi.sendUserMessage(message);
      } else {
        pi.sendUserMessage(message, { deliverAs: "followUp" });
        ctx.ui.notify("Condense workflow queued", "info");
      }
    },
  });
}
