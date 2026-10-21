import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
export const arcadeApp = path.resolve(packageRoot, '..', '..', '..', 'karmolab');
export const verifierEntry = path.join(arcadeApp, 'src/widgets/arcade/verify-entry.ts');

export function projectGameDefinitions(source) {
  const file = ts.createSourceFile('catalog.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports = new Map();
  let catalog;
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const item of bindings.elements) {
        imports.set(item.name.text, { name: item.propertyName?.text ?? item.name.text, from: statement.moduleSpecifier.text });
      }
    }
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === 'CATALOG') catalog = declaration.initializer;
    }
  }
  if (!catalog || !ts.isArrayLiteralExpression(catalog) || !catalog.elements.length) throw new Error('CATALOG must be a nonempty literal array');
  const names = catalog.elements.map(row => {
    if (!ts.isObjectLiteralExpression(row)) throw new Error('CATALOG rows must be literal objects');
    const definitions = row.properties.filter(property => ts.isPropertyAssignment(property) && property.name.getText(file) === 'def');
    if (definitions.length !== 1 || row.properties.some(ts.isSpreadAssignment) || !ts.isIdentifier(definitions[0].initializer)) throw new Error('CATALOG row must have one imported def');
    const name = definitions[0].initializer.text;
    if (!imports.has(name)) throw new Error('Unresolved CATALOG def: ' + name);
    return name;
  });
  const lines = [...new Set(names)].map(local => {
    const item = imports.get(local);
    return `import { ${item.name} as ${local} } from ${JSON.stringify(item.from)};`;
  });
  return lines.join('\n') + `\nexport const GAMES = [${names.join(',')}];\nexport const gameById = (id) => GAMES.find(game => game.id === id);\n`;
}

export function buildArcadeVerifier({ outfile = path.join(packageRoot, 'data/arcade-verifier.cjs'), write = true } = {}) {
  const catalog = path.join(arcadeApp, 'src/widgets/arcade/catalog.ts');
  return build({ entryPoints: [verifierEntry], bundle: true, format: 'cjs', platform: 'node', target: 'node20', outfile, write, logLevel: 'silent', metafile: true, plugins: [{
    name: 'arcade-server-definitions',
    setup(plugin) {
      plugin.onResolve({ filter: /^\.\/index$/ }, args => args.importer === verifierEntry ? { path: catalog, namespace: 'arcade-core' } : undefined);
      plugin.onLoad({ filter: /.*/, namespace: 'arcade-core' }, async () => ({ contents: projectGameDefinitions(await readFile(catalog, 'utf8')), loader: 'ts', resolveDir: path.dirname(catalog), watchFiles: [catalog] }));
    },
  }] });
}
