import "dotenv/config";
import { pool, db } from "./connection.js";
import { sql } from "drizzle-orm";
import * as schema from "./schema.js";

async function migrate() {
  console.log("Running migrations...");

  // Create tables using raw SQL derived from the schema
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      device_name TEXT NOT NULL,
      surveillance_period_start TIMESTAMP NOT NULL,
      surveillance_period_end TIMESTAMP NOT NULL,
      reporting_cadence VARCHAR(20) NOT NULL DEFAULT 'annual',
      normalization_basis VARCHAR(30) NOT NULL DEFAULT 'units',
      status VARCHAR(20) NOT NULL DEFAULT 'created',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS evidence_atoms (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      case_id UUID NOT NULL REFERENCES cases(id),
      evidence_type VARCHAR(30) NOT NULL,
      file_name TEXT NOT NULL,
      sha256 VARCHAR(64) NOT NULL,
      raw_data JSONB,
      canonical_data JSONB,
      qualification_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      completeness_score DOUBLE PRECISION,
      field_mapping JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS derived_inputs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      case_id UUID NOT NULL REFERENCES cases(id),
      input_type VARCHAR(50) NOT NULL,
      formula TEXT NOT NULL,
      parameters JSONB NOT NULL,
      result JSONB NOT NULL,
      code_hash VARCHAR(64) NOT NULL,
      source_hashes JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS grkb_regulations (
      id VARCHAR(100) PRIMARY KEY,
      name TEXT NOT NULL,
      jurisdiction VARCHAR(10) NOT NULL,
      version VARCHAR(30),
      effective_date TIMESTAMP,
      description TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS grkb_obligations (
      id VARCHAR(100) PRIMARY KEY,
      regulation_id VARCHAR(100) NOT NULL REFERENCES grkb_regulations(id),
      title TEXT NOT NULL,
      citation TEXT NOT NULL,
      description TEXT NOT NULL,
      applicable_to JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS grkb_constraints (
      id VARCHAR(100) PRIMARY KEY,
      obligation_id VARCHAR(100) REFERENCES grkb_obligations(id),
      constraint_type VARCHAR(20) NOT NULL,
      severity VARCHAR(10) NOT NULL,
      rule_key VARCHAR(100) NOT NULL,
      description TEXT NOT NULL,
      parameters JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS validation_rules (
      id SERIAL PRIMARY KEY,
      case_id UUID NOT NULL REFERENCES cases(id),
      rule_key VARCHAR(100) NOT NULL,
      severity VARCHAR(10) NOT NULL,
      status VARCHAR(10) NOT NULL,
      message TEXT NOT NULL,
      context JSONB,
      evaluated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS decision_traces (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      case_id UUID NOT NULL REFERENCES cases(id),
      trace_type VARCHAR(60) NOT NULL,
      chain_position INTEGER NOT NULL,
      initiated_at TIMESTAMP NOT NULL,
      completed_at TIMESTAMP NOT NULL,
      duration_ms INTEGER NOT NULL,
      input_lineage JSONB NOT NULL,
      derived_inputs_ref JSONB,
      regulatory_context JSONB,
      reasoning_chain JSONB,
      output_content JSONB,
      validation_results JSONB,
      content_hash VARCHAR(64) NOT NULL,
      previous_hash VARCHAR(64),
      merkle_root VARCHAR(64),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS generated_outputs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      case_id UUID NOT NULL REFERENCES cases(id),
      output_type VARCHAR(50) NOT NULL,
      content JSONB,
      file_path TEXT,
      sha256 VARCHAR(64),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  console.log("Migrations complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
