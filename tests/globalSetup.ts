import dotenv from "dotenv";

export default function globalSetup(): void {
  // dotenv.config() does not override a variable already present in
  // process.env, so this is a no-op in CI, where DATABASE_URL is set
  // directly by the workflow.
  dotenv.config({ path: ".env.test" });

  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("flags_test")) {
    throw new Error(
      "Refusing to run tests: DATABASE_URL does not look like a test database " +
        `(must contain "flags_test"). Got: ${url || "(not set)"}. ` +
        "The integration test suite performs real DELETEs; this guard exists " +
        "to stop it from ever running against a non-test database by mistake."
    );
  }
}
