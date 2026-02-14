/**
 * A01 — Device Identification and Variants
 *
 * Builds an annex table listing all device variants from the device master record.
 */

// ── Local type definitions (self-contained for testability) ─────────

interface Variant {
  variant_id: string;
  diameter_mm: number;
  length_mm: number;
}

interface Ctx {
  deviceMaster: {
    device_name: string;
    variants: Variant[];
  };
  evidenceAtoms: Array<{ id: string; type: string; fileName: string; sha256: string }>;
  derivedInputs: Array<{ id: string; type: string }>;
}

interface AnnexTableResult {
  tableId: string;
  title: string;
  columns: string[];
  rows: string[][];
  footnotes: string[];
  provenance: { evidenceAtomIds: string[]; derivedInputIds: string[] };
}

// ── Builder ─────────────────────────────────────────────────────────

export function buildDeviceInfoTable(ctx: Ctx): AnnexTableResult {
  const rows: string[][] = ctx.deviceMaster.variants.map((v) => [
    v.variant_id,
    String(v.diameter_mm),
    String(v.length_mm),
    `${v.diameter_mm}mm \u00d7 ${v.length_mm}mm`,
  ]);

  const evidenceAtomIds = ctx.evidenceAtoms
    .filter((ea) => ea.type === "device_master")
    .map((ea) => ea.id);

  const derivedInputIds = ctx.derivedInputs
    .filter((di) => di.type === "device_master")
    .map((di) => di.id);

  return {
    tableId: "A01",
    title: "Device Identification and Variants",
    columns: ["Variant ID", "Diameter (mm)", "Length (mm)", "Description"],
    rows,
    footnotes: ["Source: Device Master Record"],
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
