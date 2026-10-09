import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const testFiles = ["**/*.test.*", "src/test/**"];
const restrict = (group) => ({ "no-restricted-imports": ["error", { patterns: [{ group }] }] });
const base = ["../**", "./../**", "@/test/**"];
const files = (dirs) => [`src/${dirs}/**/*.{ts,tsx}`];
const uiLayers = ["app", "features", "components", "hooks", "lib", "test"];

export default [
  { ignores: ["dist", "src/api/generated"] },
  {
    files: ["src/**/*.{ts,tsx}", "e2e/**/*.ts"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/refs": "error",
    },
  },
  { files: files("{api,model,demo}"), ignores: testFiles, rules: restrict(uiLayers.flatMap((layer) => [`**/${layer}`, `**/${layer}/**`])) },
  { files: files("lib"), ignores: testFiles, rules: restrict([...base, "@/App", "@/app/**", "@/features/**", "@/components/**", "@/hooks/**", "@/demo", "@/demo/**"]) },
  { files: files("hooks"), ignores: testFiles, rules: restrict([...base, "@/App", "@/app/**", "@/features/**", "@/components/**", "@/demo", "@/demo/**"]) },
  { files: files("{components,features}"), ignores: testFiles, rules: restrict([...base, "@/App", "@/app/**", "@/features/**", "@/demo", "@/demo/**"]) },
  { files: files("app"), ignores: testFiles, rules: restrict(base) },
];
