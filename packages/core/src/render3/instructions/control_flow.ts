/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {setActiveConsumer} from '../../../primitives/signals';

import {TrackByFunction} from '../../change_detection';
import {TemplateRef} from '../../linker/template_ref';
import {formatRuntimeError, RuntimeErrorCode} from '../../errors';
import {DehydratedContainerView} from '../../hydration/interfaces';
import {
  findAndReconcileMatchingDehydratedViews,
  findMatchingDehydratedView,
} from '../../hydration/views';
import {assertDefined, assertFunction} from '../../util/assert';
import {performanceMarkFeature} from '../../util/performance';
import {assertLContainer, assertLView, assertTNode} from '../assert';
import {bindingUpdated} from '../bindings';
import {CONTAINER_HEADER_OFFSET, LContainer} from '../interfaces/container';
import {ComponentTemplate} from '../interfaces/definition';
import {
  LocalRefExtractor,
  TAttributes,
  TContainerNode,
  TNode,
  TNodeFlags,
} from '../interfaces/node';
import {
  ANIMATIONS,
  CONTEXT,
  DECLARATION_COMPONENT_VIEW,
  HEADER_OFFSET,
  HYDRATION,
  ID,
  INJECTOR,
  LView,
  TVIEW,
  TView,
} from '../interfaces/view';
import {LiveCollection, reconcile} from '../list_reconciliation';
import {destroyLView} from '../node_manipulation';
import {getLView, getSelectedIndex, getTView, nextBindingIndex} from '../state';
import {NO_CHANGE} from '../tokens';
import {getConstant, getTNode} from '../util/view_utils';
import {createAndRenderEmbeddedLView, shouldAddViewToDom} from '../view_manipulation';

import {AnimationLViewData} from '../../animation/interfaces';
import {removeDehydratedViews} from '../../hydration/cleanup';
import {
  addLViewToLContainer,
  detachView,
  getLViewFromLContainer,
  removeLViewFromLContainer,
} from '../view/container';
import {declareNoDirectiveHostTemplate} from './template';
import {removeFromAnimationQueue} from '../../animation/queue';
import {allLeavingAnimations} from '../../animation/longest_animation';

/**
 * Creates an LContainer for an ng-template representing a root node
 * of control flow (@if, @switch). We use this to explicitly set
 * flags on the TNode created to identify which nodes are in control
 * flow or starting control flow for hydration identification and
 * cleanup timing.
 *
 * @param index The index of the container in the data array
 * @param templateFn Inline template
 * @param decls The number of nodes, local refs, and pipes for this template
 * @param vars The number of bindings for this template
 * @param tagName The name of the container element, if applicable
 * @param attrsIndex Index of template attributes in the `consts` array.
 * @param localRefs Index of the local references in the `consts` array.
 * @param localRefExtractor A function which extracts local-refs values from the template.
 *        Defaults to the current element associated with the local-ref.
 * @codeGenApi
 */
export function ɵɵconditionalCreate(
  index: number,
  templateFn: ComponentTemplate<any> | null,
  decls: number,
  vars: number,
  tagName?: string | null,
  attrsIndex?: number | null,
  localRefsIndex?: number | null,
  localRefExtractor?: LocalRefExtractor,
): typeof ɵɵconditionalBranchCreate {
  performanceMarkFeature('NgControlFlow');
  const lView = getLView();
  const tView = getTView();
  const attrs = getConstant<TAttributes>(tView.consts, attrsIndex);
  declareNoDirectiveHostTemplate(
    lView,
    tView,
    index,
    templateFn,
    decls,
    vars,
    tagName,
    attrs,
    TNodeFlags.isControlFlowStart,
    localRefsIndex,
    localRefExtractor,
  );
  return ɵɵconditionalBranchCreate;
}

/**
 * Creates an LContainer for an ng-template representing a branch
 * of control flow (@else, @case, @default). We use this to explicitly
 * set flags on the TNode created to identify which nodes are in
 * control flow or starting control flow for hydration identification
 * and cleanup timing.
 *
 * @param index The index of the container in the data array
 * @param templateFn Inline template
 * @param decls The number of nodes, local refs, and pipes for this template
 * @param vars The number of bindings for this template
 * @param tagName The name of the container element, if applicable
 * @param attrsIndex Index of template attributes in the `consts` array.
 * @param localRefs Index of the local references in the `consts` array.
 * @param localRefExtractor A function which extracts local-refs values from the template.
 *        Defaults to the current element associated with the local-ref.
 * @codeGenApi
 */
export function ɵɵconditionalBranchCreate(
  index: number,
  templateFn: ComponentTemplate<any> | null,
  decls: number,
  vars: number,
  tagName?: string | null,
  attrsIndex?: number | null,
  localRefsIndex?: number | null,
  localRefExtractor?: LocalRefExtractor,
): typeof ɵɵconditionalBranchCreate {
  performanceMarkFeature('NgControlFlow');
  const lView = getLView();
  const tView = getTView();
  const attrs = getConstant<TAttributes>(tView.consts, attrsIndex);

  declareNoDirectiveHostTemplate(
    lView,
    tView,
    index,
    templateFn,
    decls,
    vars,
    tagName,
    attrs,
    TNodeFlags.isInControlFlow,
    localRefsIndex,
    localRefExtractor,
  );
  return ɵɵconditionalBranchCreate;
}

/**
 * The conditional instruction represents the basic building block on the runtime side to support
 * built-in "if" and "switch". On the high level this instruction is responsible for adding and
 * removing views selected by a conditional expression.
 *
 * @param matchingTemplateIndex Index of a template TNode representing a conditional view to be
 *     inserted; -1 represents a special case when there is no view to insert.
 * @param contextValue Value that should be exposed as the context of the conditional.
 * @codeGenApi
 */
export function ɵɵconditional<T>(matchingTemplateIndex: number, contextValue?: T) {
  performanceMarkFeature('NgControlFlow');

  const hostLView = getLView();
  const bindingIndex = nextBindingIndex();
  const prevMatchingTemplateIndex: number =
    hostLView[bindingIndex] !== NO_CHANGE ? hostLView[bindingIndex] : -1;
  const prevContainer =
    prevMatchingTemplateIndex !== -1
      ? getLContainer(hostLView, HEADER_OFFSET + prevMatchingTemplateIndex)
      : undefined;
  const viewInContainerIdx = 0;

  if (bindingUpdated(hostLView, bindingIndex, matchingTemplateIndex)) {
    const prevConsumer = setActiveConsumer(null);
    try {
      // The index of the view to show changed - remove the previously displayed one
      // (it is a noop if there are no active views in a container).
      if (prevContainer !== undefined) {
        removeLViewFromLContainer(prevContainer, viewInContainerIdx);
      }

      // Index -1 is a special case where none of the conditions evaluates to
      // a truthy value and as the consequence we've got no view to show.
      if (matchingTemplateIndex !== -1) {
        const nextLContainerIndex = HEADER_OFFSET + matchingTemplateIndex;
        const nextContainer = getLContainer(hostLView, nextLContainerIndex);
        const templateTNode = getExistingTNode(hostLView[TVIEW], nextLContainerIndex);

        const dehydratedView = findAndReconcileMatchingDehydratedViews(
          nextContainer,
          templateTNode,
          hostLView,
        );
        const embeddedLView = createAndRenderEmbeddedLView(hostLView, templateTNode, contextValue, {
          dehydratedView,
        });

        addLViewToLContainer(
          nextContainer,
          embeddedLView,
          viewInContainerIdx,
          shouldAddViewToDom(templateTNode, dehydratedView),
        );
      }
    } finally {
      setActiveConsumer(prevConsumer);
    }
  } else if (prevContainer !== undefined) {
    // We might keep displaying the same template but the actual value of the expression could have
    // changed - re-bind in context.
    const lView = getLViewFromLContainer<T | undefined>(prevContainer, viewInContainerIdx);
    if (lView !== undefined) {
      lView[CONTEXT] = contextValue;
    }
  }
}

/**
 * Renders a `@template` template with the provided named-parameter context.
 *
 * On first call an embedded view is created inside the template container at `templateIndex`.
 * On subsequent calls the existing view's context is updated so that Angular's change-detection
 * propagates new argument values into the snippet body.
 *
 * @param templateIndex The slot index of the `@template` template (as produced by `ɵɵtemplate`).
 * @param context An object whose keys match the snippet's declared parameter names.
 */
export function ɵɵsnippetRender<T extends Record<string, unknown>>(
  templateIndex: number,
  context: T,
): void {
  const hostLView = getLView();
  const containerIndex = HEADER_OFFSET + templateIndex;
  const container = getLContainer(hostLView, containerIndex);
  const viewInContainerIdx = 0;

  const existingView = getLViewFromLContainer<T>(container, viewInContainerIdx);

  if (existingView === undefined) {
    const templateTNode = getExistingTNode(hostLView[TVIEW], containerIndex);
    const embeddedLView = createAndRenderEmbeddedLView(hostLView, templateTNode, context);
    addLViewToLContainer(
      container,
      embeddedLView,
      viewInContainerIdx,
      shouldAddViewToDom(templateTNode, null),
    );
  } else {
    existingView[CONTEXT] = context;
  }
}

/**
 * Renders an arbitrary `TemplateRef` into the container at `anchorIndex`.
 *
 * Used by `@render` blocks that target a component input (or any other expression) of type
 * `Snippet<T>` / `TemplateRef<T>` rather than a locally-declared `@template` block.
 *
 * On the first call an embedded view is created from `templateRef` with `context` and inserted
 * into the anchor container.  On subsequent calls the same view is kept alive and its context is
 * updated to propagate new argument values, so Angular's normal change-detection cycle picks
 * them up.  If `templateRef` changes between calls the old view is destroyed and a new one is
 * created.
 *
 * The `context` object keys must match the parameter names declared in the corresponding
 * `@template` block in the parent component.
 *
 * @param anchorIndex  Slot index of the `DynamicRenderCreateOp` anchor container.
 * @param templateRef  The `TemplateRef` to render, or `null`/`undefined` to clear.
 * @param context      Named-parameter context matching the `@template`'s declared parameters.
 */
export function ɵɵdynamicRender<T extends Record<string, unknown>>(
  anchorIndex: number,
  templateRef: TemplateRef<T> | null | undefined,
  context: T,
): void {
  const hostLView = getLView();
  const containerIndex = HEADER_OFFSET + anchorIndex;
  const container = getLContainer(hostLView, containerIndex);
  const viewInContainerIdx = 0;

  const existingView = getLViewFromLContainer<T>(container, viewInContainerIdx);

  // Determine if the TemplateRef itself has changed (i.e. a different template is now bound).
  // We track this by stashing the current ref on the LContainer.
  const prevRef = (container as any)['__dynamicRenderRef'] as
    | (TemplateRef<T> | null | undefined)
    | undefined;
  const refChanged = prevRef !== templateRef;
  (container as any)['__dynamicRenderRef'] = templateRef;

  if (templateRef == null) {
    if (existingView !== undefined) {
      removeLViewFromLContainer(container, viewInContainerIdx);
    }
    return;
  }

  if (existingView !== undefined && !refChanged) {
    // Same template — just update the context so bindings pick up new values.
    existingView[CONTEXT] = context;
    return;
  }

  // TemplateRef changed (or first render) — destroy the stale view and create a fresh one.
  if (existingView !== undefined) {
    removeLViewFromLContainer(container, viewInContainerIdx);
  }

  // Access the internal R3 fields to call createAndRenderEmbeddedLView directly.
  // TemplateRef stores its declaring LView and TContainerNode as private fields.
  type InternalTemplateRef = {_declarationLView: LView; _declarationTContainer: TContainerNode};
  const r3Ref = templateRef as unknown as InternalTemplateRef;
  const embeddedLView = createAndRenderEmbeddedLView(
    r3Ref._declarationLView,
    r3Ref._declarationTContainer,
    context,
  );
  addLViewToLContainer(container, embeddedLView, viewInContainerIdx, true);
}

export class RepeaterContext<T> {
  constructor(
    private lContainer: LContainer,
    public $implicit: T,
    public $index: number,
  ) {}

  get $count(): number {
    return this.lContainer.length - CONTAINER_HEADER_OFFSET;
  }
}

/**
 * A built-in trackBy function used for situations where users specified collection index as a
 * tracking expression. Having this function body in the runtime avoids unnecessary code generation.
 *
 * @param index
 * @returns
 */
export function ɵɵrepeaterTrackByIndex(index: number) {
  return index;
}

/**
 * A built-in trackBy function used for situations where users specified collection item reference
 * as a tracking expression. Having this function body in the runtime avoids unnecessary code
 * generation.
 *
 * @param index
 * @returns
 */
export function ɵɵrepeaterTrackByIdentity<T>(_: number, value: T) {
  return value;
}

class RepeaterMetadata {
  constructor(
    public hasEmptyBlock: boolean,
    public trackByFn: TrackByFunction<unknown>,
    public liveCollection?: LiveCollectionLContainerImpl,
  ) {}
}

/**
 * The repeaterCreate instruction runs in the creation part of the template pass and initializes
 * internal data structures required by the update pass of the built-in repeater logic. Repeater
 * metadata are allocated in the data part of LView with the following layout:
 * - LView[HEADER_OFFSET + index] - metadata
 * - LView[HEADER_OFFSET + index + 1] - reference to a template function rendering an item
 * - LView[HEADER_OFFSET + index + 2] - optional reference to a template function rendering an empty
 * block
 *
 * @param index Index at which to store the metadata of the repeater.
 * @param templateFn Reference to the template of the main repeater block.
 * @param decls The number of nodes, local refs, and pipes for the main block.
 * @param vars The number of bindings for the main block.
 * @param tagName The name of the container element, if applicable
 * @param attrsIndex Index of template attributes in the `consts` array.
 * @param trackByFn Reference to the tracking function.
 * @param trackByUsesComponentInstance Whether the tracking function has any references to the
 *  component instance. If it doesn't, we can avoid rebinding it.
 * @param emptyTemplateFn Reference to the template function of the empty block.
 * @param emptyDecls The number of nodes, local refs, and pipes for the empty block.
 * @param emptyVars The number of bindings for the empty block.
 * @param emptyTagName The name of the empty block container element, if applicable
 * @param emptyAttrsIndex Index of the empty block template attributes in the `consts` array.
 *
 * @codeGenApi
 */
export function ɵɵrepeaterCreate(
  index: number,
  templateFn: ComponentTemplate<unknown>,
  decls: number,
  vars: number,
  tagName: string | null,
  attrsIndex: number | null,
  trackByFn: TrackByFunction<unknown>,
  trackByUsesComponentInstance?: boolean,
  emptyTemplateFn?: ComponentTemplate<unknown>,
  emptyDecls?: number,
  emptyVars?: number,
  emptyTagName?: string | null,
  emptyAttrsIndex?: number | null,
): void {
  performanceMarkFeature('NgControlFlow');

  ngDevMode &&
    assertFunction(
      trackByFn,
      `A track expression must be a function, was ${typeof trackByFn} instead.`,
    );

  const lView = getLView();
  const tView = getTView();
  const hasEmptyBlock = emptyTemplateFn !== undefined;
  const hostLView = getLView();
  const boundTrackBy = trackByUsesComponentInstance
    ? // We only want to bind when necessary, because it produces a
      // new function. For pure functions it's not necessary.
      trackByFn.bind(hostLView[DECLARATION_COMPONENT_VIEW][CONTEXT])
    : trackByFn;
  const metadata = new RepeaterMetadata(hasEmptyBlock, boundTrackBy);
  hostLView[HEADER_OFFSET + index] = metadata;

  declareNoDirectiveHostTemplate(
    lView,
    tView,
    index + 1,
    templateFn,
    decls,
    vars,
    tagName,
    getConstant(tView.consts, attrsIndex),
    TNodeFlags.isControlFlowStart,
  );

  if (hasEmptyBlock) {
    ngDevMode &&
      assertDefined(emptyDecls, 'Missing number of declarations for the empty repeater block.');
    ngDevMode &&
      assertDefined(emptyVars, 'Missing number of bindings for the empty repeater block.');

    declareNoDirectiveHostTemplate(
      lView,
      tView,
      index + 2,
      emptyTemplateFn,
      emptyDecls!,
      emptyVars!,
      emptyTagName,
      getConstant(tView.consts, emptyAttrsIndex),
      TNodeFlags.isInControlFlow,
    );
  }
}

function isViewExpensiveToRecreate(lView: LView): boolean {
  // assumption: anything more than a text node with a binding is considered "expensive"
  return lView.length - HEADER_OFFSET > 2;
}

class OperationsCounter {
  created = 0;
  destroyed = 0;

  reset() {
    this.created = 0;
    this.destroyed = 0;
  }

  recordCreate() {
    this.created++;
  }

  recordDestroy() {
    this.destroyed++;
  }

  /**
   * A method indicating if the entire collection was re-created as part of the reconciliation pass.
   * Used to warn developers about the usage of a tracking function that might result in excessive
   * amount of view creation / destroy operations.
   *
   * @returns boolean value indicating if a live collection was re-created
   */
  wasReCreated(collectionLen: number): boolean {
    return collectionLen > 0 && this.created === this.destroyed && this.created === collectionLen;
  }
}

class LiveCollectionLContainerImpl extends LiveCollection<
  LView<RepeaterContext<unknown>>,
  unknown
> {
  operationsCounter = ngDevMode ? new OperationsCounter() : undefined;

  /**
   Property indicating if indexes in the repeater context need to be updated following the live
   collection changes. Index updates are necessary if and only if views are inserted / removed in
   the middle of LContainer. Adds and removals at the end don't require index updates.
 */
  private needsIndexUpdate = false;
  constructor(
    private lContainer: LContainer,
    private hostLView: LView,
    private templateTNode: TNode,
  ) {
    super();
  }

  override get length(): number {
    return this.lContainer.length - CONTAINER_HEADER_OFFSET;
  }
  override at(index: number): unknown {
    return this.getLView(index)[CONTEXT].$implicit;
  }
  override attach(index: number, lView: LView<RepeaterContext<unknown>>): void {
    const dehydratedView = lView[HYDRATION] as DehydratedContainerView;
    this.needsIndexUpdate ||= index !== this.length;
    addLViewToLContainer(
      this.lContainer,
      lView,
      index,
      shouldAddViewToDom(this.templateTNode, dehydratedView),
    );
    clearDetachAnimationList(this.lContainer, index);
  }
  override detach(index: number): LView<RepeaterContext<unknown>> {
    this.needsIndexUpdate ||= index !== this.length - 1;
    maybeInitDetachAnimationList(this.lContainer, index);
    return detachExistingView<RepeaterContext<unknown>>(this.lContainer, index);
  }
  override create(index: number, value: unknown): LView<RepeaterContext<unknown>> {
    const dehydratedView = findMatchingDehydratedView(
      this.lContainer,
      this.templateTNode.tView!.ssrId,
    );
    const embeddedLView = createAndRenderEmbeddedLView(
      this.hostLView,
      this.templateTNode,
      new RepeaterContext(this.lContainer, value, index),
      {dehydratedView},
    );
    ngDevMode && this.operationsCounter?.recordCreate();

    return embeddedLView;
  }
  override destroy(lView: LView<RepeaterContext<unknown>>): void {
    destroyLView(lView[TVIEW], lView);
    ngDevMode && this.operationsCounter?.recordDestroy();
  }
  override updateValue(index: number, value: unknown): void {
    this.getLView(index)[CONTEXT].$implicit = value;
  }

  reset(): void {
    this.needsIndexUpdate = false;
    ngDevMode && this.operationsCounter?.reset();
  }

  updateIndexes(): void {
    if (this.needsIndexUpdate) {
      for (let i = 0; i < this.length; i++) {
        this.getLView(i)[CONTEXT].$index = i;
      }
    }
  }

  private getLView(index: number): LView<RepeaterContext<unknown>> {
    return getExistingLViewFromLContainer(this.lContainer, index);
  }
}

/**
 * The repeater instruction does update-time diffing of a provided collection (against the
 * collection seen previously) and maps changes in the collection to views structure (by adding,
 * removing or moving views as needed).
 * @param collection - the collection instance to be checked for changes
 * @codeGenApi
 */
export function ɵɵrepeater(collection: Iterable<unknown> | undefined | null): void {
  const prevConsumer = setActiveConsumer(null);
  const metadataSlotIdx = getSelectedIndex();
  try {
    const hostLView = getLView();
    const hostTView = hostLView[TVIEW];
    const metadata = hostLView[metadataSlotIdx] as RepeaterMetadata;
    const containerIndex = metadataSlotIdx + 1;
    const lContainer = getLContainer(hostLView, containerIndex);

    if (metadata.liveCollection === undefined) {
      const itemTemplateTNode = getExistingTNode(hostTView, containerIndex);
      metadata.liveCollection = new LiveCollectionLContainerImpl(
        lContainer,
        hostLView,
        itemTemplateTNode,
      );
    } else {
      metadata.liveCollection.reset();
    }

    const liveCollection = metadata.liveCollection;
    reconcile(liveCollection, collection, metadata.trackByFn, prevConsumer);

    // Warn developers about situations where the entire collection was re-created as part of the
    // reconciliation pass. Note that this warning might be "overreacting" and report cases where
    // the collection re-creation is the intended behavior. Still, the assumption is that most of
    // the time it is undesired.
    if (
      ngDevMode &&
      metadata.trackByFn === ɵɵrepeaterTrackByIdentity &&
      liveCollection.operationsCounter?.wasReCreated(liveCollection.length) &&
      isViewExpensiveToRecreate(getExistingLViewFromLContainer(lContainer, 0))
    ) {
      const message = formatRuntimeError(
        RuntimeErrorCode.LOOP_TRACK_RECREATE,
        `The configured tracking expression (track by identity) caused re-creation of the entire collection of size ${liveCollection.length}. ` +
          'This is an expensive operation requiring destruction and subsequent creation of DOM nodes, directives, components etc. ' +
          'Please review the "track expression" and make sure that it uniquely identifies items in a collection.',
      );
      console.warn(message);
    }

    // moves in the container might caused context's index to get out of order, re-adjust if needed
    liveCollection.updateIndexes();

    // handle empty blocks
    if (metadata.hasEmptyBlock) {
      const bindingIndex = nextBindingIndex();
      const isCollectionEmpty = liveCollection.length === 0;
      if (bindingUpdated(hostLView, bindingIndex, isCollectionEmpty)) {
        const emptyTemplateIndex = metadataSlotIdx + 2;
        const lContainerForEmpty = getLContainer(hostLView, emptyTemplateIndex);
        if (isCollectionEmpty) {
          const emptyTemplateTNode = getExistingTNode(hostTView, emptyTemplateIndex);
          const dehydratedView = findAndReconcileMatchingDehydratedViews(
            lContainerForEmpty,
            emptyTemplateTNode,
            hostLView,
          );
          const embeddedLView = createAndRenderEmbeddedLView(
            hostLView,
            emptyTemplateTNode,
            undefined,
            {dehydratedView},
          );
          addLViewToLContainer(
            lContainerForEmpty,
            embeddedLView,
            0,
            shouldAddViewToDom(emptyTemplateTNode, dehydratedView),
          );
        } else {
          // we know that an ssrId was generated for the empty template, but
          // we were unable to match it to a dehydrated view earlier, which
          // means that we may have changed branches between server and client.
          // We'll need to find and remove the stale empty template view.
          if (hostTView.firstUpdatePass) {
            removeDehydratedViews(lContainerForEmpty);
          }

          removeLViewFromLContainer(lContainerForEmpty, 0);
        }
      }
    }
  } finally {
    setActiveConsumer(prevConsumer);
  }
}

function getLContainer(lView: LView, index: number): LContainer {
  const lContainer = lView[index];
  ngDevMode && assertLContainer(lContainer);

  return lContainer;
}

function clearDetachAnimationList(lContainer: LContainer, index: number): void {
  if (lContainer.length <= CONTAINER_HEADER_OFFSET) return;

  const indexInContainer = CONTAINER_HEADER_OFFSET + index;
  const viewToDetach = lContainer[indexInContainer] as LView;
  const animations = viewToDetach
    ? (viewToDetach[ANIMATIONS] as AnimationLViewData | undefined)
    : undefined;
  if (
    viewToDetach &&
    animations &&
    animations.detachedLeaveAnimationFns &&
    animations.detachedLeaveAnimationFns.length > 0
  ) {
    const injector = viewToDetach[INJECTOR];
    removeFromAnimationQueue(injector, animations);
    allLeavingAnimations.delete(viewToDetach[ID]);
    animations.detachedLeaveAnimationFns = undefined;
  }
}

// Initialize the detach leave animation list for a view about to be detached, but only
// if it has leave animations.
function maybeInitDetachAnimationList(lContainer: LContainer, index: number): void {
  if (lContainer.length <= CONTAINER_HEADER_OFFSET) return;

  const indexInContainer = CONTAINER_HEADER_OFFSET + index;
  const viewToDetach = lContainer[indexInContainer];
  const animations = viewToDetach
    ? (viewToDetach[ANIMATIONS] as AnimationLViewData | undefined)
    : undefined;
  if (animations && animations.leave && animations.leave.size > 0) {
    animations.detachedLeaveAnimationFns = [];
  }
}

function detachExistingView<T>(lContainer: LContainer, index: number): LView<T> {
  const existingLView = detachView(lContainer, index);
  ngDevMode && assertLView(existingLView);

  return existingLView as LView<T>;
}

function getExistingLViewFromLContainer<T>(lContainer: LContainer, index: number): LView<T> {
  const existingLView = getLViewFromLContainer<T>(lContainer, index);
  ngDevMode && assertLView(existingLView);

  return existingLView!;
}

function getExistingTNode(tView: TView, index: number): TNode {
  const tNode = getTNode(tView, index);
  ngDevMode && assertTNode(tNode);

  return tNode;
}
