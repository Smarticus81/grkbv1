
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PizZip from "pizzip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(ROOT, "template.docx");
const OUTPUT = path.join(ROOT, "src", "templates", "builtins", "mdcg_2022_21", "template.docx");

// ── Heading → Section ID map ─────────────────────────────────────
const SECTION_MAP: Array<{ pattern: RegExp; id: string }> = [
  { pattern: /introduction/i, id: "S01" },
  { pattern: /device\s*description/i, id: "S02" },
  { pattern: /regulat(ory|ion)\s*(status|context)/i, id: "S03" },
  { pattern: /method(s|ology)/i, id: "S04" },
  { pattern: /result(s)?\s*(analysis|summary)?/i, id: "S05" },
  { pattern: /complaint(s)?\s*(summary|analysis)?/i, id: "S06" },
  { pattern: /serious\s*incident/i, id: "S07" },
  { pattern: /capa\s*(summary|status)?/i, id: "S08" },
  { pattern: /f(ield\s*)?s(afety\s*)?c(orrective\s*)?a(ction)?|fsca/i, id: "S09" },
  { pattern: /literature\s*(review|search)?/i, id: "S10" },
  { pattern: /p(ost[\s-]*)?m(arket[\s-]*)?c(linical[\s-]*)?f(ollow[\s-]*up)?|pmcf/i, id: "S11" },
  { pattern: /benefit[\s-]*risk|conclusion/i, id: "S12" },
];

const ANNEX_MAP: Array<{ pattern: RegExp; id: string }> = [
  { pattern: /annex.*A01|exposure.*country|distribution.*country/i, id: "A01" },
  { pattern: /annex.*A02|monthly.*complaint/i, id: "A02" },
  { pattern: /annex.*A03|complaint.*problem/i, id: "A03" },
  { pattern: /annex.*A04|complaint.*harm/i, id: "A04" },
  { pattern: /annex.*A05|root.*cause/i, id: "A05" },
  { pattern: /annex.*A06|problem.*harm.*cross/i, id: "A06" },
  { pattern: /annex.*A07|serious.*incident.*summ/i, id: "A07" },
  { pattern: /annex.*A08|capa.*status/i, id: "A08" },
  { pattern: /annex.*A09|fsca.*overview/i, id: "A09" },
  { pattern: /annex.*A10|literature.*review.*table/i, id: "A10" },
  { pattern: /annex.*A11|pmcf.*activit/i, id: "A11" },
  { pattern: /annex.*A12|risk.*matrix/i, id: "A12" },
];

function extractText(xml: string): string {
  const texts: string[] = [];
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) texts.push(m[1]);
  return texts.join("");
}

function isHeading(paraXml: string): boolean {
  return /<w:pStyle\s+w:val="Heading/i.test(paraXml) ||
         /<w:pStyle\s+w:val="Title"/i.test(paraXml);
}

function simplePara(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function styledPara(text: string, sourcePara: string): string {
  const pPr = sourcePara.match(/<w:pPr>(.*?)<\/w:pPr>/s);
  const rPr = sourcePara.match(/<w:rPr>(.*?)<\/w:rPr>/s);
  const pp = pPr ? `<w:pPr>${pPr[1]}</w:pPr>` : "";
  const rp = rPr ? `<w:rPr>${rPr[1]}</w:rPr>` : "";
  return `<w:p>${pp}<w:r>${rp}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function buildLoopTable(tableId: string, origTable: string): string {
  const tblPr = origTable.match(/<w:tblPr>.*?<\/w:tblPr>/s)?.[0] ?? "";
  const tblGrid = origTable.match(/<w:tblGrid>.*?<\/w:tblGrid>/s)?.[0] ?? "";
  const rows: string[] = [];
  const rr = /<w:tr\b[^>]*>.*?<\/w:tr>/gs;
  let rm: RegExpExecArray | null;
  while ((rm = rr.exec(origTable)) !== null) rows.push(rm[0]);

  if (rows.length === 0) {
    return simplePara(`{{#${tableId}.rows}}`) +
           simplePara("{{col0}} | {{col1}} | {{col2}}") +
           simplePara(`{{/${tableId}.rows}}`);
  }

  const header = rows[0];
  const nCells = (header.match(/<w:tc\b/g) || []).length;
  const dataRow = rows.length > 1 ? rows[1] : header;
  const trPr = dataRow.match(/<w:trPr>.*?<\/w:trPr>/s)?.[0] ?? "";
  const cellsRaw: string[] = [];
  const cr = /<w:tc\b[^>]*>.*?<\/w:tc>/gs;
  let cm: RegExpExecArray | null;
  while ((cm = cr.exec(dataRow)) !== null) cellsRaw.push(cm[0]);

  const newCells: string[] = [];
  for (let i = 0; i < nCells; i++) {
    const tcPr = (cellsRaw[i] || "").match(/<w:tcPr>.*?<\/w:tcPr>/s)?.[0] ?? "";
    const txt = i === 0
      ? `{{#${tableId}.rows}}{{col${i}}}`
      : i === nCells - 1
        ? `{{col${i}}}{{/${tableId}.rows}}`
        : `{{col${i}}}`;
    newCells.push(`<w:tc>${tcPr}<w:p><w:r><w:t xml:space="preserve">${txt}</w:t></w:r></w:p></w:tc>`);
  }

  return `<w:tbl>${tblPr}${tblGrid}${header}<w:tr>${trPr}${newCells.join("")}</w:tr></w:tbl>`;
}

function main() {
  if (!existsSync(INPUT)) { console.error("template.docx not found at root"); process.exit(1); }

  console.log("\n  Injecting placeholders into template.docx...");

  const buf = readFileSync(INPUT);
  const zip = new PizZip(buf);
  const docFile = zip.file("word/document.xml");
  if (!docFile) { console.error("No word/document.xml"); process.exit(1); }

  let xml = docFile.asText();
  const bodyMatch = xml.match(/<w:body>(.*)<\/w:body>/s);
  if (!bodyMatch) { console.error("No <w:body>"); process.exit(1); }

  // Extract top-level elements
  const elRegex = /<w:p\b[^>]*>.*?<\/w:p>|<w:tbl\b[^>]*>.*?<\/w:tbl>|<w:sectPr\b[^>]*>.*?<\/w:sectPr>/gs;
  const els: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = elRegex.exec(bodyMatch[1])) !== null) els.push(m[0]);

  console.log(`  ${els.length} elements found`);

  // Identify heading regions
  interface Region { type: "section"|"annex"; id: string; hIdx: number; cStart: number; cEnd: number; }
  const regions: Region[] = [];
  const usedS = new Set<string>(), usedA = new Set<string>();

  for (let i = 0; i < els.length; i++) {
    if (!els[i].startsWith("<w:p")) continue;
    const txt = extractText(els[i]);
    if (!txt.trim() || !isHeading(els[i])) continue;

    for (const { pattern, id } of SECTION_MAP) {
      if (pattern.test(txt) && !usedS.has(id)) {
        usedS.add(id);
        regions.push({ type: "section", id, hIdx: i, cStart: i+1, cEnd: -1 });
        break;
      }
    }
    for (const { pattern, id } of ANNEX_MAP) {
      if (pattern.test(txt) && !usedA.has(id)) {
        usedA.add(id);
        regions.push({ type: "annex", id, hIdx: i, cStart: i+1, cEnd: -1 });
        break;
      }
    }
  }

  regions.sort((a, b) => a.hIdx - b.hIdx);
  for (let i = 0; i < regions.length; i++) {
    regions[i].cEnd = i+1 < regions.length ? regions[i+1].hIdx : els.length;
  }

  console.log(`  Sections matched: ${regions.filter(r=>r.type==="section").map(r=>r.id).join(", ") || "NONE"}`);
  console.log(`  Annexes matched:  ${regions.filter(r=>r.type==="annex").map(r=>r.id).join(", ") || "NONE"}`);

  const replacements = new Map<number, string|null>();

  // Inject section narrative placeholders
  for (const r of regions) {
    if (r.type === "section") {
      let first = true;
      for (let i = r.cStart; i < r.cEnd; i++) {
        if (!els[i].startsWith("<w:p")) continue;
        const t = extractText(els[i]);
        if (!t.trim()) continue;
        if (isHeading(els[i])) continue;
        if (first) {
          replacements.set(i, styledPara(`{{${r.id}.narrative}}`, els[i]));
          first = false;
        } else {
          replacements.set(i, null); // remove
        }
      }
      if (first) { // no content para found — inject after heading
        replacements.set(r.hIdx, els[r.hIdx] + simplePara(`{{${r.id}.narrative}}`));
      }
    } else {
      // Annex: replace first table with loop table
      let done = false;
      for (let i = r.cStart; i < r.cEnd; i++) {
        if (els[i].startsWith("<w:tbl")) {
          replacements.set(i, buildLoopTable(r.id, els[i]));
          done = true; break;
        }
      }
      if (!done) {
        const lp = simplePara(`{{#${r.id}.rows}}`) +
                   simplePara("{{col0}} | {{col1}} | {{col2}}") +
                   simplePara(`{{/${r.id}.rows}}`);
        replacements.set(r.hIdx, els[r.hIdx] + lp);
      }
    }
  }

  // Meta placeholders at top
  const firstRegion = regions[0]?.hIdx ?? els.length;
  const metaXml = [
    "Device: {{meta.deviceName}}", "Manufacturer: {{meta.manufacturer}}",
    "Period: {{meta.periodStart}} to {{meta.periodEnd}}", "Version: {{meta.psurVersion}}",
    "Author: {{meta.psurAuthor}}", "Notified Body: {{meta.notifiedBody}}",
    "Certificate: {{meta.certificateNumber}}", "Report Date: {{meta.reportDate}}",
  ].map(t => simplePara(t)).join("");

  // Find a cover-page paragraph to attach meta to
  let metaInserted = false;
  for (let i = 0; i < firstRegion && i < els.length; i++) {
    if (!els[i].startsWith("<w:p")) continue;
    const t = extractText(els[i]).toLowerCase();
    if (t.includes("device") || t.includes("product") || t.includes("report") || t.includes("safety")) {
      replacements.set(i, els[i] + metaXml);
      metaInserted = true; break;
    }
  }
  if (!metaInserted && els.length > 0) {
    replacements.set(0, metaXml + (replacements.get(0) ?? els[0]));
  }

  // Audit + trend chart at end
  const trailing = [
    simplePara("{%trend_chart}"),
    simplePara("DTR Records: {{audit.dtrRecords}}"),
    simplePara("Chain Valid: {{audit.chainValid}}"),
    simplePara("Merkle Root: {{audit.merkleRoot}}"),
    simplePara("Validation Rules: {{audit.validationRules}}"),
    simplePara("Validation Passed: {{audit.validationPassed}}"),
    simplePara("Critical Fails: {{audit.validationCriticalFails}}"),
  ].join("");

  const last = els.length - 1;
  const existing = replacements.get(last) ?? els[last];
  if (existing?.startsWith("<w:sectPr")) {
    replacements.set(last, trailing + existing);
  } else {
    replacements.set(last, existing + trailing);
  }

  // Reassemble
  const newEls: string[] = [];
  for (let i = 0; i < els.length; i++) {
    if (replacements.has(i)) {
      const r = replacements.get(i);
      if (r !== null) newEls.push(r!);
    } else {
      newEls.push(els[i]);
    }
  }

  const newXml = xml.replace(/<w:body>.*<\/w:body>/s, `<w:body>${newEls.join("")}</w:body>`);
  zip.file("word/document.xml", newXml);

  const outBuf = Buffer.from(zip.generate({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } }));

  // Backup original
  if (existsSync(OUTPUT)) copyFileSync(OUTPUT, OUTPUT.replace(".docx", ".original.docx"));
  writeFileSync(OUTPUT, outBuf);

  // Verify
  const outZip = new PizZip(outBuf);
  const outDoc = outZip.file("word/document.xml")!.asText();
  const nPlaceholders = (outDoc.match(/\{\{[^{}]+?\}\}/g) || []).length;
  const nImages = (outDoc.match(/\{%[^{}]+?\}/g) || []).length;
  const nLoops = (outDoc.match(/\{\{#[^{}]+?\}\}/g) || []).length;

  console.log(`\n  ✓ Done! ${OUTPUT}`);
  console.log(`    {{...}} placeholders: ${nPlaceholders}`);
  console.log(`    {%...} image tags:    ${nImages}`);
  console.log(`    {{#...}} loop opens:  ${nLoops}`);
  console.log(`    Size: ${outBuf.length} bytes`);
}

main();