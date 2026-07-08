/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

/**
 * A unit of view work scheduled by a {@link RepeaterScheduler}. Running it creates/renders or
 * updates one chunk of a `@for` loop, or creates the matched branch of an `@if` block.
 */
export type RepeaterWork = () => void;

/**
 * Controls _when_ the views of a concurrent `@for` / `@if` block are rendered.
 *
 * Passing a scheduler to a control-flow block (via the `scheduler` parameter) opts that block into
 * "concurrent mode": instead of creating and rendering all of its views synchronously as part of
 * the host component's change detection, each chunk of view work is handed to the scheduler, which
 * decides when to run it. This lets large lists or heavy conditional branches render progressively
 * (time-sliced) without blocking the main thread.
 *
 * The framework never implements a scheduler itself — you provide one, giving you full control over
 * the rendering strategy (immediate, next-frame, idle-time, priority-based, etc.).
 *
 * @example
 * ```ts
 * class IdleScheduler implements RepeaterScheduler {
 *   private handles = new Set<number>();
 *   schedule(work: RepeaterWork): () => void {
 *     const id = requestIdleCallback(() => {
 *       this.handles.delete(id);
 *       work();
 *     });
 *     this.handles.add(id);
 *     return () => {
 *       this.handles.delete(id);
 *       cancelIdleCallback(id);
 *     };
 *   }
 *   beginBatch(): void {
 *     this.handles.forEach(cancelIdleCallback);
 *     this.handles.clear();
 *   }
 * }
 * ```
 *
 * ```html
 * @for (item of items(); track item.id; scheduler idleScheduler) {
 *   <li>{{ item.name }}</li>
 * }
 * ```
 *
 * @publicApi
 */
export interface RepeaterScheduler {
  /**
   * Schedules a unit of view work. The scheduler is responsible for eventually invoking `work`
   * (exactly once, unless cancelled).
   *
   * @param work The view work to run (create/render/update of one chunk of views).
   * @returns An optional cancellation function. If returned, the framework may call it to cancel
   *     this specific unit of work (e.g. when it is superseded before it has run).
   */
  schedule(work: RepeaterWork): (() => void) | void;

  /**
   * Optional hook invoked at the start of every reconciliation pass, before any new work is
   * scheduled. Use it to cancel/reset any work left over from a previous pass that has been
   * superseded by newer data (analogous to RxJS `switchMap`).
   */
  beginBatch?(): void;

  /**
   * Optional hook invoked when the block is destroyed, allowing the scheduler to release any
   * pending work and resources associated with this block.
   */
  flush?(): void;
}
