// Jest-only Babel plugin. `@babel/plugin-transform-modules-commonjs` (used by
// babel-preset-expo) rewrites `import()` to `require()` only when the file is
// flagged by `@babel/plugin-transform-dynamic-import`, which this project does
// not install (Metro handles `import()` itself). Jest's CommonJS runtime cannot
// evaluate a native `import()` without --experimental-vm-modules, so set the
// same flag that plugin sets. Source code is unchanged.
module.exports = function jestDynamicImport() {
  return {
    name: "jest-dynamic-import",
    pre() {
      this.file.set("@babel/plugin-proposal-dynamic-import", "7.0.0");
    },
  };
};
