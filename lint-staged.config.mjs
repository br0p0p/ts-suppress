export default {
  "*.{js,jsx,ts,tsx,mjs,cjs}": ["oxlint", () => "tsc --noEmit"],
  "*": "oxfmt --no-error-on-unmatched-pattern",
};
