// seed/seed.ts
// Run with: pnpm seed
import "dotenv/config";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SEED_USER_EMAIL = process.env.SEED_USER_EMAIL ?? "seed@example.com";
const SEED_USER_PASSWORD = process.env.SEED_USER_PASSWORD ?? "supersecure123";
const RESET = process.argv.includes("--reset");

async function main() {
  if (!SERVICE_KEY) {
    console.error("SUPABASE_SERVICE_ROLE_KEY not set. Source it from supabase status or apps/web/.env.local.");
    process.exit(1);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Find or create the seed user
  const { data: { users } } = await admin.auth.admin.listUsers();
  let user = users.find((u) => u.email === SEED_USER_EMAIL);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: SEED_USER_EMAIL,
      password: SEED_USER_PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) {
      console.error(`Failed to create seed user: ${error?.message}`);
      process.exit(1);
    }
    user = data.user;
    console.log(`Created seed user: ${SEED_USER_EMAIL}`);
  } else {
    console.log(`Found existing seed user: ${SEED_USER_EMAIL}`);
  }

  if (RESET) {
    // Wipe seed user's IBKR-imported rows
    const { error: rowsErr } = await admin
      .from("collection_rows")
      .delete()
      .eq("owner_id", user.id)
      .like("source", "connection:ibkr-activity-statement%");
    if (rowsErr) console.warn(`Reset rows warning: ${rowsErr.message}`);

    const { error: importsErr } = await admin
      .from("connection_imports")
      .delete()
      .eq("owner_id", user.id);
    if (importsErr) console.warn(`Reset imports warning: ${importsErr.message}`);

    console.log("Reset complete (collection rows + import audit cleared).");
  }

  const csvPath = path.join(__dirname, "sample-activity-statement.csv");
  console.log("");
  console.log("=== Seed user ready ===");
  console.log(`  Email:    ${SEED_USER_EMAIL}`);
  console.log(`  Password: ${SEED_USER_PASSWORD}`);
  console.log("");
  console.log("Next: sign in at http://localhost:3000/sign-in,");
  console.log("then go to + New page → Import data → choose the file:");
  console.log(`  ${csvPath}`);
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
