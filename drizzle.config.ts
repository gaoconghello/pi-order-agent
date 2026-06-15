import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/capabilities/store/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "wholesale_business.sqlite",
  }
});
