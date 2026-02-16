/**
 * Template Registry — Unit Tests
 *
 * Tests:
 *   - Builtin template loading
 *   - resolve() fallback chain (explicit → client default → builtin)
 *   - register() adds manifests
 *   - list() with and without clientId filter
 *   - Error on unknown templateId
 */

import { describe, it, expect, beforeEach } from "vitest";
import path from "path";
import { fileURLToPath } from "url";
import { TemplateRegistry } from "../../src/templates/registry.js";
import { BUILTIN_MDCG_MANIFEST } from "../../src/templates/builtins/mdcg_2022_21/manifest.js";
import type { TemplateManifest } from "../../src/templates/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

describe("TemplateRegistry", () => {
  let registry: TemplateRegistry;

  beforeEach(() => {
    registry = new TemplateRegistry(ROOT);
  });

  describe("loadBuiltins", () => {
    it("should load the builtin MDCG 2022-21 manifest", () => {
      const builtin = registry.get("mdcg_2022_21");
      expect(builtin).toBeDefined();
      expect(builtin!.templateId).toBe("mdcg_2022_21");
      expect(builtin!.name).toBe("MDCG 2022-21 Default");
      expect(builtin!.clientId).toBeNull();
    });

    it("should include all required slots in builtin manifest", () => {
      const builtin = registry.get("mdcg_2022_21")!;
      const slotKeys = builtin.slots.map((s) => s.key);

      // 12 sections
      for (let i = 1; i <= 12; i++) {
        const sid = `S${String(i).padStart(2, "0")}.narrative`;
        expect(slotKeys).toContain(sid);
      }
      // 12 tables
      for (let i = 1; i <= 12; i++) {
        const aid = `A${String(i).padStart(2, "0")}.rows`;
        expect(slotKeys).toContain(aid);
      }
      // Meta
      expect(slotKeys).toContain("meta.deviceName");
      expect(slotKeys).toContain("meta.manufacturer");
      // Image
      expect(slotKeys).toContain("trend_chart");
    });
  });

  describe("resolve()", () => {
    it("should resolve builtin template by explicit ID", () => {
      const resolved = registry.resolve("mdcg_2022_21");
      expect(resolved.manifest.templateId).toBe("mdcg_2022_21");
    });

    it("should fall back to builtin when no templateId or clientId given", () => {
      const resolved = registry.resolve();
      expect(resolved.manifest.templateId).toBe("mdcg_2022_21");
    });

    it("should throw on unknown templateId", () => {
      expect(() => registry.resolve("nonexistent_template")).toThrow(
        "Template not found: nonexistent_template",
      );
    });

    it("should resolve client default from clients/<clientId>/client.json", () => {
      // The demo client config points to mdcg_2022_21
      const resolved = registry.resolve(undefined, "demo");
      expect(resolved.manifest.templateId).toBe("mdcg_2022_21");
    });

    it("should fall back to builtin if client config is missing", () => {
      const resolved = registry.resolve(undefined, "nonexistent_client");
      expect(resolved.manifest.templateId).toBe("mdcg_2022_21");
    });
  });

  describe("register()", () => {
    it("should register a custom manifest and make it resolvable", () => {
      const custom: TemplateManifest = {
        templateId: "test_custom_v1",
        name: "Test Custom",
        clientId: "testclient",
        version: "1.0.0",
        type: "custom",
        sourceDocxPath: "/fake/path.docx",
        slots: [{ key: "S01.narrative", type: "richText", required: true }],
        mappingRules: { "S01.narrative": "S01.narrative" },
      };

      registry.register(custom);
      const got = registry.get("test_custom_v1");
      expect(got).toBeDefined();
      expect(got!.name).toBe("Test Custom");
    });
  });

  describe("list()", () => {
    it("should list all templates without filter", () => {
      const all = registry.list();
      expect(all.length).toBeGreaterThanOrEqual(1);
      expect(all.some((m) => m.templateId === "mdcg_2022_21")).toBe(true);
    });

    it("should filter by clientId (includes builtin null-clientId templates)", () => {
      const custom: TemplateManifest = {
        templateId: "client_only_v1",
        name: "Client Only",
        clientId: "special_client",
        version: "1.0.0",
        type: "custom",
        sourceDocxPath: null,
        slots: [],
        mappingRules: {},
      };
      registry.register(custom);

      const filtered = registry.list("special_client");
      // Should include the custom + builtin (null clientId)
      expect(filtered.some((m) => m.templateId === "client_only_v1")).toBe(true);
      expect(filtered.some((m) => m.templateId === "mdcg_2022_21")).toBe(true);
    });
  });
});
