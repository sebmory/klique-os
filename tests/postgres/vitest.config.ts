import path from "node:path";
import { defineConfig } from "vitest/config";

const repositoryRoot = path.resolve(__dirname, "..", "..");

export default defineConfig({
  root: repositoryRoot,
  envDir: false,
  test: {
    environment: "node",
    include: [
      "tests/postgres/partner-athlete-introduction-repository.postgres.test.ts",
    ],
    fileParallelism: false,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": repositoryRoot,
    },
  },
});
