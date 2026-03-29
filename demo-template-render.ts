/**
 * @template / @render compile demo.
 *
 * Run from the repo root:
 *   npx tsx demo-template-render.ts
 */

import {parseTemplate} from './packages/compiler/src/render3/view/template.ts';

const TEMPLATE = `
  @template figure(image) {
    <figure>
      <img [src]="image.src" [alt]="image.alt" />
      <figcaption>{{ image.alt }}</figcaption>
    </figure>
  }

  @for (img of images; track img.id) {
    @if (img.href) {
      <a [href]="img.href">@render figure(img) {}</a>
    } @else {
      @render figure(img) {}
    }
  }

  @render dynamicTemplate(item) {}
`;

const {nodes, errors} = parseTemplate(TEMPLATE, 'demo.html', {
  preserveWhitespaces: false,
});

if (errors && errors.length > 0) {
  console.error('Parse errors:');
  errors.forEach((e) => console.error(' ', e.toString()));
  process.exit(1);
}

const G = '\x1b[32m';
const C = '\x1b[36m';
const M = '\x1b[35m';
const Y = '\x1b[33m';
const R = '\x1b[0m';

console.log('✅  Template parsed. AST:\n');

function printNodes(nodes: any[], indent = '  '): void {
  for (const node of nodes) {
    const ctor: string = node.constructor.name;
    if (ctor === 'TemplateBlock') {
      const params = node.parameters.map((p: any) => p.name).join(', ');
      console.log(`${indent}${G}@template${R} ${Y}"${node.templateName}"${R}(${C}${params}${R}) {`);
      printNodes(node.children, indent + '  ');
      console.log(`${indent}}`);
    } else if (ctor === 'RenderBlock') {
      const args = node.args.map((a: any) => a.source?.trim() ?? '?').join(', ');
      console.log(`${indent}${C}@render${R} ${Y}"${node.templateName}"${R}(${args})`);
    } else if (ctor === 'ForLoopBlock') {
      const expr = node.expression?.source?.trim() ?? '?';
      console.log(`${indent}${M}@for${R} (${node.item.name} of ${expr}) {`);
      printNodes(node.children, indent + '  ');
      console.log(`${indent}}`);
    } else if (ctor === 'IfBlock') {
      for (const branch of node.branches) {
        const cond = branch.expression
          ? `${M}@if${R} (${branch.expression.source?.trim()})`
          : `${M}@else${R}`;
        console.log(`${indent}${cond} {`);
        printNodes(branch.children, indent + '  ');
        console.log(`${indent}}`);
      }
    } else if (ctor.startsWith('Element')) {
      console.log(`${indent}<${node.name}>`);
    }
  }
}

printNodes(nodes);

const templateBlocks = nodes.filter((n) => n.constructor.name === 'TemplateBlock');
const renderBlocks = (function findRenders(ns: any[]): any[] {
  const result: any[] = [];
  for (const n of ns) {
    if (n.constructor.name === 'RenderBlock') result.push(n);
    if (n.children) result.push(...findRenders(n.children));
    if (n.branches) for (const b of n.branches) result.push(...findRenders(b.children ?? []));
  }
  return result;
})(nodes);

console.log('\n─────────────────────────────────────────────');
console.log(`${G}@template${R} declarations found: ${templateBlocks.length}`);
console.log(`${C}@render${R} calls found: ${renderBlocks.length}`);

const localRenders = renderBlocks.filter((r) =>
  templateBlocks.some((t) => t.templateName === r.templateName),
);
const dynamicRenders = renderBlocks.filter(
  (r) => !templateBlocks.some((t) => t.templateName === r.templateName),
);

console.log(`  ${G}↳ local${R} (targeting a local @template):  ${localRenders.length}`);
console.log(`  ${C}↳ dynamic${R} (targeting a TemplateRef input): ${dynamicRenders.length}`);
if (dynamicRenders.length > 0) {
  console.log(`    → "${dynamicRenders.map((r) => r.templateName).join('", "')}"`);
  console.log(`    → compiles to ɵɵdynamicRender(anchorSlot, ctx.<name>, {args})`);
}
