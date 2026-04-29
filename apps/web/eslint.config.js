import { nextJsConfig } from "@workspace/eslint-config/next-js"

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,

  // Ignore Next.js auto-generated files
  {
    ignores: ["next-env.d.ts"],
  },

  // Restrict admin client imports globally
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/lib/supabase/admin", "@/lib/supabase/admin"],
              message:
                "Admin client may only be imported from actions/admin/* — it bypasses RLS.",
            },
          ],
        },
      ],
    },
  },

  // Allow the admin client only in actions/admin/**
  {
    files: ["actions/admin/**/*.ts", "actions/admin/**/*.tsx"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]
