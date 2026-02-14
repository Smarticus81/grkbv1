/**
 * Pack Loader — Reads pack manifest, raw files, and produces normalized datasets.
 *
 * Orchestrates: manifest parsing → raw file reading → auto-mapping →
 * profile generation → normalization → write to /normalized/ directory.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

import { PackManifestSchema } from "./types.js";
import type { PackManifest, PackProfile, FileDescriptor } from "./types.js";
import { suggestMappings, buildFileMappingProfile, buildPackProfile } from "./mapper.js";
import { normalizeRecords, normalizeJsonObject } from "./normalizer.js";
import { sha256Bytes } from "../shared/hash.js";

export interface PackLoadResult {
  manifest: PackManifest;
  profile: PackProfile;
  normalizedDir: string;
  fileHashes: Record<string, string>;
  warnings: string[];
}

/**
 * Load a pack manifest from the pack directory.
 */
export function loadManifest(packDir: string): PackManifest {
  const manifestPath = path.join(packDir, "pack.manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Pack manifest not found: ${manifestPath}`);
  }
  const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
  return PackManifestSchema.parse(raw);
}

/**
 * Load an existing pack profile or return null if not found.
 */
export function loadProfile(packDir: string): PackProfile | null {
  const profilePath = path.join(packDir, "pack.profile.json");
  if (!existsSync(profilePath)) return null;
  return JSON.parse(readFileSync(profilePath, "utf-8"));
}

/**
 * Read a raw CSV file and return headers + parsed records.
 */
function readCsvFile(filePath: string): { headers: string[]; records: Record<string, string>[] } {
  const buffer = readFileSync(filePath);
  const records = parse(buffer.toString("utf-8"), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  const headers = records.length > 0 ? Object.keys(records[0]) : [];
  return { headers, records };
}

/**
 * Read a raw JSON file.
 */
function readJsonFile(filePath: string): Record<string, unknown> {
  const buffer = readFileSync(filePath);
  return JSON.parse(buffer.toString("utf-8"));
}

/**
 * Find the raw file path within the pack directory.
 * Checks both /raw/ subdirectory and pack root.
 */
function findRawFile(packDir: string, filename: string): string {
  const rawPath = path.join(packDir, "raw", filename);
  if (existsSync(rawPath)) return rawPath;
  const rootPath = path.join(packDir, filename);
  if (existsSync(rootPath)) return rootPath;
  throw new Error(`Raw file not found: ${filename} (checked raw/ and pack root)`);
}

/**
 * Run the full pack mapping pipeline:
 * 1. Read manifest
 * 2. Read raw files
 * 3. Auto-map columns
 * 4. Generate profile
 * 5. Normalize data
 * 6. Write normalized files + profile
 */
export function mapPack(packDir: string): PackLoadResult {
  const manifest = loadManifest(packDir);
  const warnings: string[] = [];
  const fileHashes: Record<string, string> = {};

  // Collect all file descriptors (required + optional)
  const allDescriptors: FileDescriptor[] = [
    ...manifest.files.required,
    ...manifest.files.optional,
  ];

  // Read raw files and collect metadata for profile generation
  const fileData: Array<{
    fileId: string;
    filename: string;
    canonicalTarget: string;
    headers: string[];
    sampleRows: Record<string, string>[];
    fileType: "csv" | "json";
    rawData: any;
  }> = [];

  for (const desc of allDescriptors) {
    try {
      const filePath = findRawFile(packDir, desc.filename);
      const buffer = readFileSync(filePath);
      fileHashes[desc.id] = sha256Bytes(buffer);

      if (desc.type === "csv") {
        const { headers, records } = readCsvFile(filePath);
        fileData.push({
          fileId: desc.id,
          filename: desc.filename,
          canonicalTarget: desc.canonicalTarget,
          headers,
          sampleRows: records.slice(0, 20),
          fileType: "csv",
          rawData: records,
        });
      } else {
        const jsonData = readJsonFile(filePath);
        fileData.push({
          fileId: desc.id,
          filename: desc.filename,
          canonicalTarget: desc.canonicalTarget,
          headers: Object.keys(jsonData),
          sampleRows: [],
          fileType: "json",
          rawData: jsonData,
        });
      }
    } catch (err: any) {
      const isRequired = manifest.files.required.some((r) => r.id === desc.id);
      if (isRequired) {
        throw new Error(`Required file missing: ${desc.filename} — ${err.message}`);
      }
      warnings.push(`Optional file skipped: ${desc.filename} — ${err.message}`);
    }
  }

  // Generate mapping profile
  const profile = buildPackProfile(
    manifest,
    fileData.map((fd) => ({
      fileId: fd.fileId,
      filename: fd.filename,
      canonicalTarget: fd.canonicalTarget,
      headers: fd.headers,
      sampleRows: fd.sampleRows,
    }))
  );

  // Normalize and write
  const normalizedDir = path.join(packDir, "normalized");
  mkdirSync(normalizedDir, { recursive: true });

  for (const fd of fileData) {
    const fileProfile = profile.fileMappings.find((m) => m.fileId === fd.fileId);
    if (!fileProfile) {
      warnings.push(`No mapping profile for ${fd.filename}, copying as-is`);
      continue;
    }

    if (fd.fileType === "csv") {
      const normalized = normalizeRecords(fd.rawData, fileProfile);
      const outPath = path.join(normalizedDir, fd.filename);
      writeCsvFile(outPath, normalized);
    } else {
      const normalized = normalizeJsonObject(fd.rawData, fileProfile);
      const outPath = path.join(normalizedDir, fd.filename);
      writeFileSync(outPath, JSON.stringify(normalized, null, 2));
    }
  }

  // Write profile
  const profilePath = path.join(packDir, "pack.profile.json");
  writeFileSync(profilePath, JSON.stringify(profile, null, 2));

  return { manifest, profile, normalizedDir, fileHashes, warnings };
}

/**
 * Write normalized CSV records to a file.
 */
function writeCsvFile(filePath: string, records: Record<string, string>[]): void {
  if (records.length === 0) {
    writeFileSync(filePath, "");
    return;
  }
  const headers = Object.keys(records[0]);
  const lines = [
    headers.join(","),
    ...records.map((r) =>
      headers
        .map((h) => {
          const val = r[h] ?? "";
          // Quote values containing commas, quotes, or newlines
          if (val.includes(",") || val.includes('"') || val.includes("\n")) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        })
        .join(",")
    ),
  ];
  writeFileSync(filePath, lines.join("\n") + "\n");
}

/**
 * Load normalized datasets from a pack directory.
 * Returns parsed data ready for the PSUR pipeline.
 */
export function loadNormalizedPack(packDir: string): {
  manifest: PackManifest;
  data: Record<string, any>;
  fileHashes: Record<string, string>;
} {
  const manifest = loadManifest(packDir);
  const normalizedDir = path.join(packDir, "normalized");

  if (!existsSync(normalizedDir)) {
    throw new Error(`Normalized directory not found. Run pack:map first: ${normalizedDir}`);
  }

  const data: Record<string, any> = {};
  const fileHashes: Record<string, string> = {};

  const allDescriptors = [...manifest.files.required, ...manifest.files.optional];

  for (const desc of allDescriptors) {
    const filePath = path.join(normalizedDir, desc.filename);
    if (!existsSync(filePath)) continue;

    const buffer = readFileSync(filePath);
    fileHashes[desc.id] = sha256Bytes(buffer);

    if (desc.type === "csv") {
      data[desc.canonicalTarget] = parse(buffer.toString("utf-8"), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } else {
      data[desc.canonicalTarget] = JSON.parse(buffer.toString("utf-8"));
    }
  }

  return { manifest, data, fileHashes };
}
