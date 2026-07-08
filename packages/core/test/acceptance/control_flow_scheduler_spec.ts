/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {
  ChangeDetectionStrategy,
  Component,
  provideZoneChangeDetection,
  RepeaterScheduler,
  RepeaterWork,
} from '../../src/core';
import {TestBed} from '../../testing';

/**
 * A `RepeaterScheduler` whose work is driven manually by the test, so we can observe concurrent
 * (deferred / chunked) rendering deterministically.
 */
class ManualScheduler implements RepeaterScheduler {
  queue: RepeaterWork[] = [];
  batches = 0;
  cancelled = 0;

  schedule(work: RepeaterWork): () => void {
    this.queue.push(work);
    return () => {
      const idx = this.queue.indexOf(work);
      if (idx > -1) {
        this.queue.splice(idx, 1);
        this.cancelled++;
      }
    };
  }

  beginBatch(): void {
    this.batches++;
  }

  /** Runs the next pending unit of work (which may itself schedule the following chunk). */
  flushOne(): boolean {
    const work = this.queue.shift();
    if (work === undefined) {
      return false;
    }
    work();
    return true;
  }

  /** Runs all pending work to completion, including chunks scheduled while flushing. */
  flushAll(): void {
    let guard = 0;
    while (this.flushOne()) {
      if (++guard > 10_000) {
        throw new Error('ManualScheduler.flushAll did not converge');
      }
    }
  }
}

describe('control flow - scheduler (concurrent mode)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZoneChangeDetection()],
    });
  });

  describe('@for', () => {
    @Component({
      template: '@for (item of items; track item; scheduler scheduler) {{{item}}|}',
      standalone: false,
      changeDetection: ChangeDetectionStrategy.Eager,
    })
    class ForComponent {
      scheduler = new ManualScheduler();
      items: number[] = [];
    }

    it('should defer rendering of the loop views to the scheduler', () => {
      const fixture = TestBed.createComponent(ForComponent);
      const cmp = fixture.componentInstance;
      cmp.items = [1, 2, 3];
      fixture.detectChanges();

      // Nothing is rendered synchronously — the work was handed to the scheduler.
      expect(cmp.scheduler.queue.length).toBeGreaterThan(0);
      expect(fixture.nativeElement.textContent).toBe('');

      cmp.scheduler.flushAll();
      expect(fixture.nativeElement.textContent).toBe('1|2|3|');
    });

    it('should render a large collection progressively across chunks', () => {
      const fixture = TestBed.createComponent(ForComponent);
      const cmp = fixture.componentInstance;
      cmp.items = Array.from({length: 60}, (_, i) => i);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toBe('');

      // First chunk renders a prefix, but not the whole collection.
      cmp.scheduler.flushOne();
      const afterFirstChunk = fixture.nativeElement.textContent as string;
      expect(afterFirstChunk.length).toBeGreaterThan(0);
      expect(afterFirstChunk).not.toBe(Array.from({length: 60}, (_, i) => `${i}|`).join(''));

      // Remaining chunks complete the collection.
      cmp.scheduler.flushAll();
      expect(fixture.nativeElement.textContent).toBe(
        Array.from({length: 60}, (_, i) => `${i}|`).join(''),
      );
    });

    it('should cancel in-flight work and start a new batch when data changes', () => {
      const fixture = TestBed.createComponent(ForComponent);
      const cmp = fixture.componentInstance;
      cmp.items = Array.from({length: 60}, (_, i) => i);
      fixture.detectChanges();

      const batchesAfterFirst = cmp.scheduler.batches;
      cmp.scheduler.flushOne(); // render only the first chunk

      // New data arrives before the previous render finished.
      cmp.items = [100, 200];
      fixture.detectChanges();

      // A new batch was started and the stale pending chunk was cancelled.
      expect(cmp.scheduler.batches).toBeGreaterThan(batchesAfterFirst);
      expect(cmp.scheduler.cancelled).toBeGreaterThan(0);

      cmp.scheduler.flushAll();
      expect(fixture.nativeElement.textContent).toBe('100|200|');
    });

    it('should render the @empty block synchronously when the collection is empty', () => {
      @Component({
        template:
          '@for (item of items; track item; scheduler scheduler) {{{item}}|} @empty {EMPTY}',
        standalone: false,
        changeDetection: ChangeDetectionStrategy.Eager,
      })
      class EmptyComponent {
        scheduler = new ManualScheduler();
        items: number[] = [];
      }

      const fixture = TestBed.createComponent(EmptyComponent);
      fixture.detectChanges();
      // The empty block is not subject to the scheduler.
      expect(fixture.nativeElement.textContent).toBe('EMPTY');

      fixture.componentInstance.items = [1];
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toBe('');
      fixture.componentInstance.scheduler.flushAll();
      expect(fixture.nativeElement.textContent).toBe('1|');
    });
  });

  describe('@if', () => {
    @Component({
      template: '@if (show; scheduler scheduler) {YES} @else {NO}',
      standalone: false,
      changeDetection: ChangeDetectionStrategy.Eager,
    })
    class IfComponent {
      scheduler = new ManualScheduler();
      show = false;
    }

    it('should defer creation of the matched branch to the scheduler', () => {
      const fixture = TestBed.createComponent(IfComponent);
      const cmp = fixture.componentInstance;
      fixture.detectChanges();
      cmp.scheduler.flushAll();
      expect(fixture.nativeElement.textContent).toBe('NO');

      cmp.show = true;
      fixture.detectChanges();
      // The previous branch is removed but the new one is deferred.
      expect(fixture.nativeElement.textContent).toBe('');
      expect(cmp.scheduler.queue.length).toBeGreaterThan(0);

      cmp.scheduler.flushAll();
      expect(fixture.nativeElement.textContent).toBe('YES');
    });

    it('should cancel a deferred branch if the condition changes again before it renders', () => {
      const fixture = TestBed.createComponent(IfComponent);
      const cmp = fixture.componentInstance;
      cmp.show = true;
      fixture.detectChanges();
      expect(cmp.scheduler.queue.length).toBeGreaterThan(0);

      // Flip back before the scheduled branch ran.
      cmp.show = false;
      fixture.detectChanges();
      cmp.scheduler.flushAll();

      expect(cmp.scheduler.cancelled).toBeGreaterThan(0);
      expect(fixture.nativeElement.textContent).toBe('NO');
    });
  });
});
