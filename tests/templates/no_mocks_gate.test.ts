/**
 * No-Mocks Gate — CI Guard Test
 *
 * Ensures NO mock/demo/stub/test LLM providers or fake data generators
 * leak into production source files.
 *
 * Scanned paths: src/**\/*.ts (excluding test files)
 * Forbidden patterns: MockLLM, FakeProvider, DemoProvider, StubClient,
 *   TestProvider, hardcoded API keys, mock transport functions.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { globSync } from "glob";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, "..", "..", "src");

// Patterns that should NOT appear in production source files
const FORBIDDEN_PATTERNS = [
  /class\s+Mock[A-Z]\w*Provider/,
  /class\s+Fake[A-Z]\w*Provider/,
  /class\s+Stub[A-Z]\w*Client/,
  /class\s+Demo[A-Z]\w*Provider/,
  /class\s+TestLLM/,
  /class\s+MockLLM/,
  /new\s+Mock(OpenAI|Azure|LLM)/,
  // Hardcoded API keys (basic check)
  /sk-[A-Za-z0-9]{20,}/,
  /OPENAI_API_KEY\s*=\s*["'][^"']+["']/,
  // Debug overrides that bypass real calls
  /MOCK_MODE\s*=\s*true/,
  /SKIP_LLM\s*=\s*true/,
  /DRY_RUN_LLM\s*=\s*true/,
];

// Files that are allowed to reference test/mock concepts (e.g., explaining them in comments)
const EXEMPT_FILES = [
  "llm_client.ts", // May contain config docs with mock references in comments
];

describe("No-Mocks Production Gate", () => {
  it("should have zero forbidden mock/stub/demo patterns in src/**/*.ts", () => {
    const files = globSync("**/*.ts", { cwd: SRC_ROOT, absolute: true });
    const violations: { file: string; line: number; match: string; pattern: string }[] = [];

    for (const filePath of files) {
      const basename = path.basename(filePath);
      if (EXEMPT_FILES.includes(basename)) continue;

      // Skip test files that accidentally end up in src/
      if (basename.endsWith(".test.ts") || basename.endsWith(".spec.ts")) continue;

      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        // Skip comment-only lines
        if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

        for (const pattern of FORBIDDEN_PATTERNS) {
          const match = line.match(pattern);
          if (match) {
            violations.push({
              file: path.relative(SRC_ROOT, filePath),
              line: lineIdx + 1,
              match: match[0],
              pattern: pattern.source,
            });
          }
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line} → "${v.match}" (pattern: ${v.pattern})`)
        .join("\n");
      expect.fail(
        `Found ${violations.length} forbidden mock/stub pattern(s) in production source:\n${report}`,
      );
    }
  });

  it("should not have mock/demo environment variable defaults in production", () => {
    const files = globSync("**/*.ts", { cwd: SRC_ROOT, absolute: true });
    const envViolations: string[] = [];

    const envPatterns = [
      /process\.env\.\w+\s*\?\?\s*["']mock["']/i,
      /process\.env\.\w+\s*\?\?\s*["']demo["']/i,
      /process\.env\.\w+\s*\|\|\s*["']fake["']/i,
    ];

    for (const filePath of files) {
      const content = readFileSync(filePath, "utf-8");
      for (const pattern of envPatterns) {
        if (pattern.test(content)) {
          envViolations.push(
            `${path.relative(SRC_ROOT, filePath)}: env default matches ${pattern.source}`,
          );
        }
      }
    }

    expect(envViolations).toEqual([]);
  });
});
