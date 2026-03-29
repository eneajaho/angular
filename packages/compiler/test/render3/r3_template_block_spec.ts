/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

/**
 * Tests for the `@template` / `@render` block syntax introduced in Angular.
 *
 * These tests validate:
 *  - Parsing of `@template name(params) { ... }` into `TemplateBlock` AST nodes
 *  - Parsing of `@render name(args) {}` into `RenderBlock` AST nodes
 *  - Error cases (missing name, invalid params)
 *  - Recursive visitation via `RecursiveVisitor`
 */

import * as t from '../../src/render3/r3_ast';
import {parseR3 as parse} from './view/util';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSnippets(html: string) {
  return parse(html, {ignoreError: false});
}

function expectErrors(html: string) {
  return parse(html, {ignoreError: true}).errors;
}

// ---------------------------------------------------------------------------
// @template AST node tests
// ---------------------------------------------------------------------------

describe('@template block parsing', () => {
  it('should produce a TemplateBlock node with the correct name and parameters', () => {
    const {nodes, errors} = parseSnippets('@template figure(image) { <img /> }');
    expect(errors.length).toBe(0);
    expect(nodes.length).toBe(1);

    const block = nodes[0] as t.TemplateBlock;
    expect(block instanceof t.TemplateBlock).toBe(true);
    expect(block.templateName).toBe('figure');
    expect(block.parameters.length).toBe(1);
    expect(block.parameters[0].name).toBe('image');
  });

  it('should support multiple parameters', () => {
    const {nodes, errors} = parseSnippets('@template card(title, body, footer) { <div></div> }');
    expect(errors.length).toBe(0);

    const block = nodes[0] as t.TemplateBlock;
    expect(block instanceof t.TemplateBlock).toBe(true);
    expect(block.parameters.length).toBe(3);
    expect(block.parameters.map((p) => p.name)).toEqual(['title', 'body', 'footer']);
  });

  it('should support zero parameters', () => {
    const {nodes, errors} = parseSnippets('@template loader() { <span>Loading…</span> }');
    expect(errors.length).toBe(0);

    const block = nodes[0] as t.TemplateBlock;
    expect(block instanceof t.TemplateBlock).toBe(true);
    expect(block.templateName).toBe('loader');
    expect(block.parameters.length).toBe(0);
  });

  it('should collect children inside the snippet body', () => {
    const {nodes, errors} = parseSnippets(
      '@template row(item) { <td>{{item.name}}</td><td>{{item.value}}</td> }',
    );
    expect(errors.length).toBe(0);

    const block = nodes[0] as t.TemplateBlock;
    // Two <td> elements inside the snippet
    const elements = block.children.filter((n) => n instanceof t.Element);
    expect(elements.length).toBe(2);
  });

  it('should emit a parse error when @template has no parameter list', () => {
    const errors = expectErrors('@template { <div></div> }');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].msg).toContain('@template requires a name and parameter list');
  });

  it('should handle whitespace around parameter names', () => {
    const {nodes, errors} = parseSnippets('@template  mySnippet(  a  ,  b  ) { }');
    expect(errors.length).toBe(0);

    const block = nodes[0] as t.TemplateBlock;
    expect(block.templateName).toBe('mySnippet');
    expect(block.parameters.map((p) => p.name)).toEqual(['a', 'b']);
  });
});

// ---------------------------------------------------------------------------
// @render AST node tests
// ---------------------------------------------------------------------------

describe('@render block parsing', () => {
  it('should produce a RenderBlock node with the correct name and args', () => {
    const {nodes, errors} = parseSnippets(
      '@template greet(name) { <b>{{name}}</b> } @render greet(user.name) {}',
    );
    expect(errors.length).toBe(0);
    expect(nodes.length).toBe(2);

    const render = nodes[1] as t.RenderBlock;
    expect(render instanceof t.RenderBlock).toBe(true);
    expect(render.templateName).toBe('greet');
    expect(render.args.length).toBe(1);
  });

  it('should support zero arguments in @render', () => {
    const {nodes, errors} = parseSnippets(
      '@template noArgs() { <span>static</span> } @render noArgs() {}',
    );
    expect(errors.length).toBe(0);

    const render = nodes[1] as t.RenderBlock;
    expect(render instanceof t.RenderBlock).toBe(true);
    expect(render.args.length).toBe(0);
  });

  it('should support multiple arguments in @render', () => {
    const {nodes, errors} = parseSnippets(
      '@template tile(a, b, c) { } @render tile(x, y.z, foo()) {}',
    );
    expect(errors.length).toBe(0);

    const render = nodes[1] as t.RenderBlock;
    expect(render instanceof t.RenderBlock).toBe(true);
    expect(render.args.length).toBe(3);
  });

  it('should emit a parse error when @render has no parameter list', () => {
    const errors = expectErrors('@render { }');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].msg).toContain('@render requires a template name and arguments');
  });
});

// ---------------------------------------------------------------------------
// RecursiveVisitor integration
// ---------------------------------------------------------------------------

describe('RecursiveVisitor with @template/@render', () => {
  it('should visit snippet body children via RecursiveVisitor', () => {
    const {nodes} = parseSnippets('@template list(items) { <ul><li>{{items}}</li></ul> }');

    const visited: string[] = [];
    const visitor = new (class extends t.RecursiveVisitor {
      override visitElement(el: t.Element) {
        visited.push(`Element:${el.name}`);
        super.visitElement(el);
      }
    })();

    t.visitAll(visitor, nodes);

    expect(visited).toContain('Element:ul');
    expect(visited).toContain('Element:li');
  });

  it('should not mutate snippet children array on recursive visit', () => {
    const {nodes} = parseSnippets('@template foo(x) { <div></div><span></span> }');
    const block = nodes[0] as t.TemplateBlock;
    const originalLength = block.children.length;

    const visitor = new t.RecursiveVisitor();
    t.visitAll(visitor, nodes);

    // Children array must not have been mutated
    expect(block.children.length).toBe(originalLength);
  });

  it('should visit @render without errors', () => {
    const {nodes} = parseSnippets('@template item(x) { <li>{{x}}</li> } @render item(data) {}');

    const visited: string[] = [];
    const visitor = new (class extends t.RecursiveVisitor {
      override visitRenderBlock(block: t.RenderBlock) {
        visited.push(`render:${block.templateName}`);
      }
    })();

    t.visitAll(visitor, nodes);
    expect(visited).toContain('render:item');
  });
});

// ---------------------------------------------------------------------------
// Snippet + control-flow interoperability
// ---------------------------------------------------------------------------

describe('@template inside control-flow blocks', () => {
  it('should parse @template declared before @for with @render inside', () => {
    const {nodes, errors} = parseSnippets(`
      @template row(item) { <tr><td>{{item}}</td></tr> }
      @for (item of items; track item) {
        @render row(item) {}
      }
    `);
    expect(errors.length).toBe(0);

    expect(nodes[0] instanceof t.TemplateBlock).toBe(true);
    expect(nodes[1] instanceof t.ForLoopBlock).toBe(true);

    const forBlock = nodes[1] as t.ForLoopBlock;
    const renderBlock = forBlock.children.find((n) => n instanceof t.RenderBlock);
    expect(renderBlock).toBeDefined();
  });

  it('should parse @template used in @if / @else branches', () => {
    const {nodes, errors} = parseSnippets(`
      @template msg(text) { <p>{{text}}</p> }
      @if (show) {
        @render msg(label) {}
      } @else {
        @render msg(fallback) {}
      }
    `);
    expect(errors.length).toBe(0);

    expect(nodes[0] instanceof t.TemplateBlock).toBe(true);
    const ifBlock = nodes[1] as t.IfBlock;
    expect(ifBlock instanceof t.IfBlock).toBe(true);

    // Both branches contain a @render block
    for (const branch of ifBlock.branches) {
      const render = branch.children.find((n) => n instanceof t.RenderBlock);
      expect(render).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Dynamic @render (targets a TemplateRef input, not a local @template)
// ---------------------------------------------------------------------------

describe('@render with TemplateRef inputs (dynamic mode)', () => {
  it('should parse @render targeting an input without a local @template', () => {
    // `row` is NOT declared as a local @template — it is a component input of type Snippet<T>.
    const {nodes, errors} = parseSnippets('@render row(item) {}');
    expect(errors.length).toBe(0);
    expect(nodes.length).toBe(1);

    const render = nodes[0] as t.RenderBlock;
    expect(render instanceof t.RenderBlock).toBe(true);
    expect(render.templateName).toBe('row');
    expect(render.args.length).toBe(1);
  });

  it('should allow a local @template sibling and a dynamic @render in the same view', () => {
    const {nodes, errors} = parseSnippets(`
      @template local(x) { <span>{{x}}</span> }
      @render local(a) {}
      @render inputTemplate(b) {}
    `);
    expect(errors.length).toBe(0);
    expect(nodes[0] instanceof t.TemplateBlock).toBe(true);

    const renderLocal = nodes[1] as t.RenderBlock;
    expect(renderLocal.templateName).toBe('local');

    const renderDynamic = nodes[2] as t.RenderBlock;
    expect(renderDynamic.templateName).toBe('inputTemplate');
  });

  it('should pass multiple arguments in dynamic @render', () => {
    const {nodes, errors} = parseSnippets('@render card(title, subtitle) {}');
    expect(errors.length).toBe(0);

    const render = nodes[0] as t.RenderBlock;
    expect(render.templateName).toBe('card');
    expect(render.args.length).toBe(2);
  });
});
