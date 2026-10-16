// Source-boundary checks prevent old mixed service files and production mock imports returning.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = path.join(root, "frontend/src");
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (/\.(ts|tsx)$/.test(target)) files.push(target);
  }
}
walk(source);
const failures = [];
for (const file of files) {
  const tree = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true
  );
  function visit(node) {
    let spec;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      spec = node.moduleSpecifier.text;
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    )
      spec = node.argument.literal.text;
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      ts.isStringLiteral(node.arguments[0])
    )
      spec = node.arguments[0].text;
    if (spec?.startsWith("@demo/"))
      failures.push(`${path.relative(root, file)}: production source imports synthetic fixtures`);
    if (spec && (spec.startsWith("@/") || spec.startsWith("."))) {
      const target = spec.startsWith("@/")
        ? path.join(source, spec.slice(2))
        : path.resolve(path.dirname(file), spec);
      const choices = [
        target,
        ...[".ts", ".tsx", ".css", "/index.ts", "/index.tsx"].map((suffix) => target + suffix),
      ];
      const resolved = choices.find(
        (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      );
      const label = path.relative(root, file);
      if (!resolved) failures.push(`${label}: unresolved ${spec}`);
      else if (!resolved.startsWith(source + path.sep))
        failures.push(`${label}: production source imports an external fixture/backend file`);
      if (/shared\/(?:ui|analytics)\//.test(label) && spec.startsWith("@/features/"))
        failures.push(`${label}: shared rendering depends on a feature`);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}
for (const obsolete of [
  "app",
  "components",
  "features",
  "hooks",
  "lib",
  "services",
  "types",
  "data",
]) {
  if (fs.existsSync(path.join(root, obsolete)))
    failures.push(`Obsolete frontend source directory: ${obsolete}`);
}
assert.equal(failures.length, 0, failures.join("\n"));
console.log(
  `Frontend structure: ${files.length} modules have valid owned imports and no production fixtures.`
);
