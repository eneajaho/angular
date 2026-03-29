/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {TemplateRef} from './linker/template_ref';

/**
 * Represents a reusable template fragment declared with `@template`.
 *
 * The type parameter `T` is a tuple of the snippet's parameter types in declaration order.
 * Use this type for component `@Input()` properties that accept snippet content from a parent.
 *
 * @usageNotes
 * ### Declaring a snippet and passing it to a child component
 *
 * ```html
 * @template row(item) {
 *   <td>{{ item.name }}</td>
 * }
 *
 * <app-table [row]="row" />
 * ```
 *
 * ```typescript
 * @Component({ ... })
 * class TableComponent<T> {
 *   @Input() row!: Snippet<[T]>;
 * }
 * ```
 *
 * ### Rendering a snippet input inside a child component
 *
 * ```html
 * @for (item of items; track item.id) {
 *   @render row(item) {}
 * }
 * ```
 *
 * @publicApi
 */
export type Snippet<T extends unknown[] = []> = TemplateRef<SnippetContext<T>>;

/**
 * Maps a positional tuple of snippet parameter types to a named-context object type.
 * The resulting object uses the runtime parameter names (strings) as keys, each typed
 * as `unknown` at the type level since names are not encoded in the tuple.
 *
 * @publicApi
 */
export type SnippetContext<T extends unknown[]> = Record<string, T[number]>;
