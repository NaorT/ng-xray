import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/cli.ts", "src/index.ts"],
  format: "esm",
  dts: true,
  clean: true,
  target: "node20",
  external: ["dependency-cruiser"],
  define: {
    "process.env.VERSION": JSON.stringify(process.env.npm_package_version ?? "0.1.0"),
  },
});
