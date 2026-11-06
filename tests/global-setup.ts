import { Client } from "pg";
import { migrate } from "../scripts/migrate";

// Rebuilds the test database from the migrations before each run.
export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/ghl_sync_test");
  const name = url.pathname.slice(1);
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.query(`create database ${name}`);
  await admin.end();
  await migrate(url.toString(), () => {});
}
