/*!
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import ts from 'typescript';

import {ErrorCode, makeDiagnostic} from '../../../diagnostics';
import {ImportedSymbolsTracker} from '../../../imports';
import {TemplateTypeChecker, TypeCheckingConfig} from '../../../typecheck/api';

import {SourceFileValidatorRule} from './api';
import {findMatchingDirectivesAndPipes} from '@angular/compiler';

/**
 * Rule that checks for directives that are used but not imported.
 */
export class PotentialDirectivesToImportRule implements SourceFileValidatorRule {
  constructor(
    private templateTypeChecker: TemplateTypeChecker,
    private typeCheckingConfig: TypeCheckingConfig,
    private importedSymbolsTracker: ImportedSymbolsTracker,
  ) {}

  shouldCheck(sourceFile: ts.SourceFile): boolean {
    return (
      this.typeCheckingConfig.reportMissingImports !== 'suppress' &&
      (this.importedSymbolsTracker.hasNamedImport(sourceFile, 'Component', '@angular/core') ||
        this.importedSymbolsTracker.hasNamespaceImport(sourceFile, '@angular/core'))
    );
  }

  checkNode(node: ts.Node): ts.Diagnostic | null {
    if (!ts.isClassDeclaration(node)) {
      return null;
    }

    const potentialDirectives = this.templateTypeChecker.getPotentialTemplateDirectives(node);
    const potentialPipes = this.templateTypeChecker.getPotentialPipes(node);

    if (potentialDirectives.length === 0 && potentialPipes.length === 0) {
      return null;
    }

    const category =
      this.typeCheckingConfig.reportMissingImports === 'error'
        ? ts.DiagnosticCategory.Error
        : ts.DiagnosticCategory.Warning;

    const selectors = potentialDirectives
      .map((x) => x.selector)
      .filter((x) => !!x)
      .concat(potentialPipes.map((x) => x.name).filter((x) => !!x));

    // we need a way to get a reference to the template string
    const componentTemplate = `
       <section>
                <div></div>
                <span used></span>
              </section>
    `;

    const {directives, pipes} = findMatchingDirectivesAndPipes(
      componentTemplate,
      selectors as string[],
    );

    const directivesToReport = [...directives.regular, ...directives.deferCandidates]
      .map((x) => {
        return potentialDirectives.find((y) => y.selector === x);
      })
      .filter((x) => !!x);

    const pipesToReport = [...pipes.regular, ...pipes.deferCandidates]
      .map((x) => {
        return potentialPipes.find((y) => y.name === x);
      })
      .filter((x) => !!x);

    return makeDiagnostic(
      ErrorCode.UNUSED_STANDALONE_IMPORTS,
      node,
      'Imports are required for the following directives and pipes: ' +
        directivesToReport.map((dir) => dir.tsSymbol.name).join(', ') +
        ', ' +
        pipesToReport.map((x) => x.tsSymbol.name).join(', '),
      undefined,
      category,
    );
  }
}
