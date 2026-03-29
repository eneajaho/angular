/**
 * @template / @render compile demo.
 *
 * Parses a template with @template/@render and prints the resulting AST nodes,
 * demonstrating that the new block types are parsed correctly.
 *
 * Run from the repo root:
 *   npx tsx packages/core/test/bundling/template-render/compile-demo.mts
 */

import {parseTemplate} from '../../../../compiler/src/render3/view/template.ts';
import type {
  ForLoopBlock,
  IfBlock,
  Node,
  RenderBlock,
  TemplateBlock,
} from '../../../../compiler/src/render3/r3_ast.ts';

// ── Template under test ────────────────────────────────────────────────────

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

// ── Compile ────────────────────────────────────────────────────────────────

const {nodes, errors} = parseTemplate(TEMPLATE, 'demo.html', {
  preserveWhitespaces: false,
});

if (errors && errors.length > 0) {
  console.error('❌  Parse errors:');
  errors.forEach((e) => console.error('  ', e.toString()));
  process.exit(1);
}

// ── Print AST ──────────────────────────────────────────────────────────────

const G = '\x1b[32m'; // green
const C = '\x1b[36m'; // cyan
const M = '\x1b[35m'; // magenta
const Y = '\x1b[33m'; // yellow
const R = '\x1b[0m'; // reset

console.log('✅  Template parsed. AST:\n');

function printNodes(nodes: Node[], indent = '  '): void {
  for (const node of nodes) {
    const ctor = node.constructor.name;
    if (ctor === 'TemplateBlock') {
      const tb = node as unknown as TemplateBlock;
      const params = tb.parameters.map((p) => p.name).join(', ');
      console.log(`${indent}${G}@template${R} ${Y}"${tb.templateName}"${R}(${C}${params}${R}) {`);
      printNodes(tb.children, indent + '  ');
      console.log(`${indent}}`);
    } else if (ctor === 'RenderBlock') {
      const rb = node as unknown as RenderBlock;
      const argStr = rb.args.length ? rb.args.map((a: any) => a.source?.trim()).join(', ') : '';
      console.log(`${indent}${C}@render${R} ${Y}"${rb.templateName}"${R}(${argStr})`);
    } else if (ctor === 'ForLoopBlock') {
      const fb = node as unknown as ForLoopBlock;
      const expr = (fb.expression as any).source?.trim() ?? '?';
      console.log(`${indent}${M}@for${R} (${fb.item.name} of ${expr}) {`);
      printNodes(fb.children, indent + '  ');
      console.log(`${indent}}`);
    } else if (ctor === 'IfBlock') {
      const ib = node as unknown as IfBlock;
      for (const branch of ib.branches) {
        const cond = branch.expression
          ? `${M}@if${R} (${(branch.expression as any).source?.trim()})`
          : `${M}@else${R}`;
        console.log(`${indent}${cond} {`);
        printNodes(branch.children, indent + '  ');
        console.log(`${indent}}`);
      }
    } else if (ctor.startsWith('Element')) {
      console.log(`${indent}<${(node as any).name}>`);
    }
  }
}

printNodes(nodes);

// ── Summary ────────────────────────────────────────────────────────────────

const templateBlocks = nodes.filter((n) => n.constructor.name === 'TemplateBlock');
const renderBlocks = nodes.filter((n) => n.constructor.name === 'RenderBlock');

console.log('\n─────────────────────────────────────────────');
console.log(`${G}@template${R} declarations: ${templateBlocks.length}`);
console.log(`${C}@render${R} calls (top-level): ${renderBlocks.length}`);
console.log(
  `  └─ last @render targets "${(renderBlocks.at(-1) as unknown as RenderBlock)?.templateName}" (dynamic — not a local @template)`,
);
