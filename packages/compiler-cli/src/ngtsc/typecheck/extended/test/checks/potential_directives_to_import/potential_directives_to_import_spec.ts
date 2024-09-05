/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import ts from 'typescript';

import {ErrorCode, ExtendedTemplateDiagnosticName, ngErrorCode} from '../../../../../diagnostics';
import {absoluteFrom, getSourceFileOrError} from '../../../../../file_system';
import {runInEachFileSystem} from '../../../../../file_system/testing';
// import {getSourceCodeForDiagnostic} from '../../../../../testing';
import {getClass, setup} from '../../../../testing';
import {factory as potentialDirectivesToImport} from '../../../checks/potential_directives_to_import';
import {ExtendedTemplateCheckerImpl} from '../../../src/extended_template_checker';

runInEachFileSystem(() => {
  fdescribe('PotentialDirectivesToImportFactoryCheck', () => {
    it('binds the error code to its extended template diagnostic name', () => {
      expect(potentialDirectivesToImport.code).toBe(ErrorCode.POTENTIAL_DIRECTIVES_TO_IMPORT);
      expect(potentialDirectivesToImport.name).toBe(
        ExtendedTemplateDiagnosticName.POTENTIAL_DIRECTIVES_TO_IMPORT,
      );
    });

    it('should produce a diagnostic that shows some directives which can be imported', () => {
      const fileName = absoluteFrom('/main.ts');
      const {program, templateTypeChecker} = setup(
        [
          {
            fileName,
            templates: {
              'TestCmp': ` <button myDir>Hello</button> <my-btn>Hi</my-btn> `,
            },
            declarations: [
              {
                type: 'directive',
                file: fileName,
                name: 'OtherDir',
                selector: '[myDir]',
              },
              {
                type: 'directive',
                file: fileName,
                name: 'MyBtn',
                selector: 'my-btn',
                isStandalone: true,
              },
            ],
            source: `
              export class TestCmp { }
              export class OtherDir { }
              export class MyBtn { }
            `,
          },
        ],
        {},
      );

      const sf = getSourceFileOrError(program, fileName);
      const component = getClass(sf, 'TestCmp');
      const extendedTemplateChecker = new ExtendedTemplateCheckerImpl(
        templateTypeChecker,
        program.getTypeChecker(),
        [potentialDirectivesToImport],
        {} /* options */,
      );
      const files = program.getSourceFiles();

      const diags = extendedTemplateChecker.getDiagnosticsForComponent(component);

      expect(diags.length).toBe(0);
      // expect(diags[0].category).toBe(ts.DiagnosticCategory.Warning);
      // expect(diags[0].code).toBe(ngErrorCode(ErrorCode.POTENTIAL_DIRECTIVES_TO_IMPORT));
      // expect(getSourceCodeForDiagnostic(diags[0])).toBe(`(click)="increment"`);
      // expect(diags[0].messageText).toBe(generateDiagnosticText('increment()'));
    });
  });
});
