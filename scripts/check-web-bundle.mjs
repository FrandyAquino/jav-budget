import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import ts from 'typescript';

// Inspect the actual Metro payload, not just whether the HTTP request succeeded.
const origin = process.env.EXPO_TEST_URL || 'http://localhost:8081';
const response = await fetch(origin);
assert.equal(response.status, 200, 'Web entry must return HTTP 200');
const html = await response.text();
const entry = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)]
  .map((match) => match[1].replaceAll('&amp;', '&'))
  .find((src) => src.includes('entry.bundle'));
assert.ok(entry, 'Expected a development entry bundle');
assert.ok(!entry.includes('transform.asyncRoutes=true'), 'Routes must load synchronously');
const bundleResponse = await fetch(new URL(entry, origin));
assert.equal(bundleResponse.status, 200, 'Metro must compile the web bundle');
const source = ts.createSourceFile('entry.js', await bundleResponse.text(), ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
const modules = new Map();
for (const statement of source.statements) {
  if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
  const call = statement.expression;
  if (call.expression.getText(source) !== '__d') continue;
  const [, id, dependencies, name] = call.arguments;
  if (!id || !ts.isNumericLiteral(id)) continue;
  const required = [];
  if (dependencies && ts.isArrayLiteralExpression(dependencies)) {
    for (const dep of dependencies.elements) if (ts.isNumericLiteral(dep)) required.push(Number(dep.text));
  }
  modules.set(Number(id.text), { name: name && ts.isStringLiteral(name) ? name.text : id.text, required });
}
assert.ok(modules.size > 1000, 'Expected the complete app module graph');
const missing = [];
for (const module of modules.values()) {
  for (const id of module.required) if (!modules.has(id)) missing.push(`${module.name} requires missing module ${id}`);
}
assert.deepEqual(missing, [], 'All synchronous dependency IDs must exist');
const routes = [...modules.values()].filter((module) => /^src\/app\/.*\.tsx$/.test(module.name));
const onDisk = readdirSync('src/app', { recursive: true }).filter((file) => String(file).endsWith('.tsx')).length;
assert.equal(routes.length, onDisk, `All ${onDisk} app route/layout modules must be bundled`);
console.log(`PASS: ${modules.size} registered modules, ${routes.length} routes/layouts, no missing synchronous dependencies.`);
