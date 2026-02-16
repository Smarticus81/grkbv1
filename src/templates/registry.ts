/**
 * Template Registry — Loads, caches, and resolves template manifests.
 *
 * Resolution order:
 *   1. Explicit templateId from CLI
 *   2. Client default (from clients/<clientId>/client.json)
 *   3. Builtin "mdcg_2022_21" default
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import path from "path";
import type { TemplateManifest, ResolvedTemplate, ClientConfig } from "./types.js";
import { BUILTIN_MDCG_MANIFEST, resolveBuiltinTemplateJson } from "./builtins/mdcg_2022_21/manifest.js";

export class TemplateRegistry {
  private manifests = new Map<string, TemplateManifest>();
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.loadBuiltins();
    this.loadCustomTemplates();
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Resolve a templateId to its manifest and DOCX path.
   * Falls back to builtin default if not found.
   */
  resolve(
    templateId?: string,
    clientId?: string,
  ): ResolvedTemplate {
    // 1. Explicit templateId
    if (templateId) {
      const manifest = this.manifests.get(templateId);
      if (!manifest) {
        throw new Error(`Template not found: ${templateId}`);
      }
      return this.buildResolved(manifest);
    }

    // 2. Client default
    if (clientId) {
      const clientConfig = this.loadClientConfig(clientId);
      if (clientConfig) {
        const manifest = this.manifests.get(clientConfig.defaultTemplateId);
        if (manifest) return this.buildResolved(manifest);
      }
    }

    // 3. Builtin default
    return this.buildResolved(BUILTIN_MDCG_MANIFEST);
  }

  /** Get a manifest by templateId. */
  get(templateId: string): TemplateManifest | undefined {
    return this.manifests.get(templateId);
  }

  /** Register a manifest (used by ingest pipeline). */
  register(manifest: TemplateManifest): void {
    this.manifests.set(manifest.templateId, manifest);
  }

  /** List all registered templates, optionally filtered by clientId. */
  list(clientId?: string): TemplateManifest[] {
    const all = [...this.manifests.values()];
    if (!clientId) return all;
    return all.filter(
      (m) => m.clientId === clientId || m.clientId === null,
    );
  }

  // ── Internals ──────────────────────────────────────────────

  private loadBuiltins(): void {
    this.manifests.set(BUILTIN_MDCG_MANIFEST.templateId, BUILTIN_MDCG_MANIFEST);
  }

  private loadCustomTemplates(): void {
    const storeDir = path.join(this.rootDir, "templates_store");
    if (!existsSync(storeDir)) return;

    // Walk: templates_store/<clientId>/<name>/<version>/manifest.json
    for (const clientDir of safeDirs(storeDir)) {
      const clientPath = path.join(storeDir, clientDir);
      for (const nameDir of safeDirs(clientPath)) {
        const namePath = path.join(clientPath, nameDir);
        for (const versionDir of safeDirs(namePath)) {
          const manifestPath = path.join(namePath, versionDir, "manifest.json");
          if (existsSync(manifestPath)) {
            try {
              const raw = readFileSync(manifestPath, "utf-8");
              const manifest = JSON.parse(raw) as TemplateManifest;
              this.manifests.set(manifest.templateId, manifest);
            } catch {
              // Skip malformed manifests
            }
          }
        }
      }
    }
  }

  private loadClientConfig(clientId: string): ClientConfig | null {
    const configPath = path.join(this.rootDir, "clients", clientId, "client.json");
    if (!existsSync(configPath)) return null;
    try {
      return JSON.parse(readFileSync(configPath, "utf-8")) as ClientConfig;
    } catch {
      return null;
    }
  }

  private buildResolved(manifest: TemplateManifest): ResolvedTemplate {
    let docxPath: string | null = null;
    if (manifest.sourceDocxPath) {
      docxPath = path.isAbsolute(manifest.sourceDocxPath)
        ? manifest.sourceDocxPath
        : path.join(this.rootDir, manifest.sourceDocxPath);
    }

    // Resolve template.json path for schema-driven rendering
    let templateJsonPath: string | null = null;
    if (manifest.templateId === BUILTIN_MDCG_MANIFEST.templateId) {
      templateJsonPath = resolveBuiltinTemplateJson();
    } else {
      // Custom templates: check for template.json next to manifest
      const storeBase = manifest.sourceDocxPath
        ? path.dirname(path.isAbsolute(manifest.sourceDocxPath)
            ? manifest.sourceDocxPath
            : path.join(this.rootDir, manifest.sourceDocxPath))
        : null;
      if (storeBase) {
        const jsonCandidate = path.join(storeBase, "template.json");
        if (existsSync(jsonCandidate)) {
          templateJsonPath = jsonCandidate;
        }
      }
    }

    return { manifest, docxPath, templateJsonPath };
  }
}

function safeDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((entry) => {
    try {
      return statSync(path.join(dir, entry)).isDirectory();
    } catch {
      return false;
    }
  });
}
