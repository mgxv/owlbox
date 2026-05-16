import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: ["dist/**", "src-tauri/**", "node_modules/**", "injected/**"],
    },
    js.configs.recommended,
    {
        files: ["**/*.{ts,tsx}"],
        extends: [...tseslint.configs.recommendedTypeChecked],
        languageOptions: {
            globals: globals.browser,
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: {
            "react-hooks": reactHooks,
            "react-refresh": reactRefresh,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            "react-refresh/only-export-components": [
                "warn",
                { allowConstantExport: true },
            ],
        },
    },
    {
        files: ["tests/**/*.{js,ts,tsx}"],
        languageOptions: {
            globals: { ...globals.node, ...globals.browser },
        },
        rules: {
            "@typescript-eslint/unbound-method": "off",
        },
    },
);
