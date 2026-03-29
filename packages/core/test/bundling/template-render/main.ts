/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

/**
 * Demo for the `@template` / `@render` block syntax.
 *
 * Scenario 1 — local templates:
 *   @template figure(image) { ... } declared once, rendered multiple times with @render.
 *
 * Scenario 2 — passing a template as an input:
 *   Parent declares @template row(item) { ... } and passes `row` to <app-table [row]="row">.
 *   The child renders it with @render row(item) {}.
 */

import {Component, Input, provideZonelessChangeDetection} from '@angular/core';
import {Snippet} from '@angular/core';
import {bootstrapApplication} from '@angular/platform-browser';

// ─── Scenario 2: Child component that accepts a Snippet input ───────────────

interface Item {
  id: number;
  name: string;
  price: string;
}

@Component({
  selector: 'app-table',
  template: `
    <table>
      <thead>
        <tr><th>Row</th></tr>
      </thead>
      <tbody>
        @for (item of items; track item.id) {
          @render row(item) {}
        }
      </tbody>
    </table>
  `,
})
class TableComponent {
  @Input() row!: Snippet<[Item]>;

  items: Item[] = [
    {id: 1, name: 'Widget A', price: '$9.99'},
    {id: 2, name: 'Widget B', price: '$14.99'},
    {id: 3, name: 'Widget C', price: '$4.99'},
  ];
}

// ─── Root component ──────────────────────────────────────────────────────────

interface Image {
  src: string;
  alt: string;
  href?: string;
}

@Component({
  selector: 'app-root',
  imports: [TableComponent],
  template: `
    <h1>@template / @render demo</h1>

    <!-- ── Scenario 1: Local templates ── -->
    <section>
      <h2>Gallery (local @template)</h2>

      @template figure(image) {
        <figure style="display:inline-block;margin:8px;text-align:center">
          <img [src]="image.src" [alt]="image.alt" width="120" height="80"
               style="border-radius:4px;object-fit:cover" />
          <figcaption>{{ image.alt }}</figcaption>
        </figure>
      }

      <div>
        @for (img of images; track img.src) {
          @if (img.href) {
            <a [href]="img.href" target="_blank">
              @render figure(img) {}
            </a>
          } @else {
            @render figure(img) {}
          }
        }
      </div>
    </section>

    <!-- ── Scenario 2: Passing a template as component input ── -->
    <section style="margin-top:32px">
      <h2>Table (template passed as &#64;Input)</h2>

      @template row(item) {
        <tr>
          <td>{{ item.id }}</td>
          <td><strong>{{ item.name }}</strong></td>
          <td>{{ item.price }}</td>
        </tr>
      }

      <app-table [row]="row" />
    </section>
  `,
})
class AppComponent {
  images: Image[] = [
    {src: 'https://picsum.photos/seed/a/120/80', alt: 'Photo A', href: 'https://picsum.photos'},
    {src: 'https://picsum.photos/seed/b/120/80', alt: 'Photo B'},
    {src: 'https://picsum.photos/seed/c/120/80', alt: 'Photo C', href: 'https://picsum.photos'},
    {src: 'https://picsum.photos/seed/d/120/80', alt: 'Photo D'},
  ];
}

bootstrapApplication(AppComponent, {providers: [provideZonelessChangeDetection()]});
