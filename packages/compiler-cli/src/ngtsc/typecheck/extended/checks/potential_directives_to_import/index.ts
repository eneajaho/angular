/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {AST, TmplAstNode} from '@angular/compiler';
import ts from 'typescript';

import {ErrorCode, ExtendedTemplateDiagnosticName} from '../../../../diagnostics';
import {NgTemplateDiagnostic, SymbolKind} from '../../../api';
import {TemplateCheckFactory, TemplateCheckWithVisitor, TemplateContext} from '../../api';

/**
 * A template check that detects potential directives that need to be imported.
 * This check is useful for detecting directives that are used in the template but not imported.
 */
class PotentialDirectivesToImportBindingSpec extends TemplateCheckWithVisitor<ErrorCode.POTENTIAL_DIRECTIVES_TO_IMPORT> {
  override code = ErrorCode.POTENTIAL_DIRECTIVES_TO_IMPORT as const;

  override visitNode(
    ctx: TemplateContext<ErrorCode.POTENTIAL_DIRECTIVES_TO_IMPORT>,
    component: ts.ClassDeclaration,
    node: TmplAstNode | AST,
  ): NgTemplateDiagnostic<ErrorCode.POTENTIAL_DIRECTIVES_TO_IMPORT>[] {
    const potentialDirectives = ctx.templateTypeChecker.getPotentialTemplateDirectives(component);

    console.log('potentialDirectives:', potentialDirectives);

    return [];
    //
    // // If the node is not a bound event, skip it.
    // if (!(node instanceof TmplAstBoundEvent)) return [];
    //
    // // If the node is not a regular or animation event, skip it.
    // if (node.type !== ParsedEventType.Regular && node.type !== ParsedEventType.Animation) return [];
    //
    // if (!(node.handler instanceof ASTWithSource)) return [];
    //
    // const sourceExpressionText = node.handler.source || '';
    //
    // if (node.handler.ast instanceof Chain) {
    //   // (click)="increment; decrement"
    //   return node.handler.ast.expressions.flatMap((expression) =>
    //     assertExpressionInvoked(expression, component, node, sourceExpressionText, ctx),
    //   );
    // }
    //
    // if (node.handler.ast instanceof Conditional) {
    //   // (click)="true ? increment : decrement"
    //   const {trueExp, falseExp} = node.handler.ast;
    //   return [trueExp, falseExp].flatMap((expression) =>
    //     assertExpressionInvoked(expression, component, node, sourceExpressionText, ctx),
    //   );
    // }
    //
    // // (click)="increment"
    // return assertExpressionInvoked(node.handler.ast, component, node, sourceExpressionText, ctx);
  }
}

function generateStringFromExpression(expression: AST, source: string): string {
  return source.substring(expression.span.start, expression.span.end);
}

export const factory: TemplateCheckFactory<
  ErrorCode.POTENTIAL_DIRECTIVES_TO_IMPORT,
  ExtendedTemplateDiagnosticName.POTENTIAL_DIRECTIVES_TO_IMPORT
> = {
  code: ErrorCode.POTENTIAL_DIRECTIVES_TO_IMPORT,
  name: ExtendedTemplateDiagnosticName.POTENTIAL_DIRECTIVES_TO_IMPORT,
  create: () => new PotentialDirectivesToImportBindingSpec(),
};
