#!/usr/bin/env tsx
/**
 * CLI: psur:template:list
 *
 * Usage: npm run psur:template:list [-- --client <clientId>]
 *
 * Lists all registered templates (builtin + custom).
 */

import path from "path";
import { fileURLToPath } from "url";
import { TemplateRegistry } from "./registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

async function main() {
  const args = process.argv.slice(2);
  let clientId = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--client" && i + 1 < args.length) {
      clientId = args[i + 1];
      i++;
    }
  }

  const registry = new TemplateRegistry(ROOT);
  const templates = registry.list(clientId || undefined);

  console.log(`  Registered templates: ${templates.length}`);
  console.log();

  for (const t of templates) {
    const client = t.clientId ?? "(builtin)";
    const slots = t.slots.length;
    console.log(`  ${t.templateId}`);
    console.log(`    Name:    ${t.name}`);
    console.log(`    Type:    ${t.type}`);
    console.log(`    Client:  ${client}`);
    console.log(`    Version: ${t.version}`);
    console.log(`    Slots:   ${slots}`);
    if (t.sourceDocxPath) {
      console.log(`    DOCX:    ${t.sourceDocxPath}`);
    }
    console.log();
  }
}

main();
