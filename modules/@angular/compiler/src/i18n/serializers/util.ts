/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

const TAG_TO_PLACEHOLDER_NAMES: {[k: string]: string} = {
  'A': 'LINK',
  'B': 'BOLD_TEXT',
  'BR': 'LINE_BREAK',
  'EM': 'EMPHASISED_TEXT',
  'H1': 'HEADING_LEVEL1',
  'H2': 'HEADING_LEVEL2',
  'H3': 'HEADING_LEVEL3',
  'H4': 'HEADING_LEVEL4',
  'H5': 'HEADING_LEVEL5',
  'H6': 'HEADING_LEVEL6',
  'HR': 'HORIZONTAL_RULE',
  'I': 'ITALIC_TEXT',
  'LI': 'LIST_ITEM',
  'LINK': 'MEDIA_LINK',
  'OL': 'ORDERED_LIST',
  'P': 'PARAGRAPH',
  'Q': 'QUOTATION',
  'S': 'STRIKETHROUGH_TEXT',
  'SMALL': 'SMALL_TEXT',
  'SUB': 'SUBSTRIPT',
  'SUP': 'SUPERSCRIPT',
  'TBODY': 'TABLE_BODY',
  'TD': 'TABLE_CELL',
  'TFOOT': 'TABLE_FOOTER',
  'TH': 'TABLE_HEADER_CELL',
  'THEAD': 'TABLE_HEADER',
  'TR': 'TABLE_ROW',
  'TT': 'MONOSPACED_TEXT',
  'U': 'UNDERLINED_TEXT',
  'UL': 'UNORDERED_LIST',
};

/**
 * Creates unique names for placeholder with different content
 *
 * @internal
 */
export class PlaceholderRegistry {
  private _placeHolderNameCounts: {[k: string]: number} = {};
  private _signatureToName: {[k: string]: string} = {};

  getStartTagPlaceholderName(tag: string, attrs: {[k: string]: string}, isVoid: boolean): string {
    const signature = this._hashTag(tag, attrs, isVoid);
    if (this._signatureToName[signature]) {
      return this._signatureToName[signature];
    }

    const upperTag = tag.toUpperCase();
    const baseName = TAG_TO_PLACEHOLDER_NAMES[upperTag] || `TAG_${upperTag}`;
    const name = this._generateUniqueName(isVoid ? baseName : `START_${baseName}`);

    this._signatureToName[signature] = name;

    return name;
  }

  getCloseTagPlaceholderName(tag: string): string {
    const signature = this._hashClosingTag(tag);
    if (this._signatureToName[signature]) {
      return this._signatureToName[signature];
    }

    const upperTag = tag.toUpperCase();
    const baseName = TAG_TO_PLACEHOLDER_NAMES[upperTag] || `TAG_${upperTag}`;
    const name = this._generateUniqueName(`CLOSE_${baseName}`);

    this._signatureToName[signature] = name;

    return name;
  }

  getPlaceholderName(name: string, content: string): string {
    const upperName = name.toUpperCase();
    const signature = `PH: ${upperName}=${content}`;
    if (this._signatureToName[signature]) {
      return this._signatureToName[signature];
    }

    const uniqueName = this._generateUniqueName(upperName);
    this._signatureToName[signature] = uniqueName;

    return uniqueName;
  }

  private _hashTag(tag: string, attrs: {[k: string]: string}, isVoid: boolean): string {
    const start = `<${tag.toUpperCase()}`;
    const strAttrs =
        Object.getOwnPropertyNames(attrs).sort().map((name) => ` ${name}=${attrs[name]}`).join('');
    const end = isVoid ? '/>' : `></${tag.toUpperCase()}>`;

    return start + strAttrs + end;
  }

  private _hashClosingTag(tag: string): string {
    return this._hashTag(`/${tag.toUpperCase()}`, {}, false);
  }

  private _generateUniqueName(base: string): string {
    let name = base;
    let next = this._placeHolderNameCounts[name];

    if (!next) {
      next = 1;
    } else {
      name += `_${next}`;
      next++;
    }

    this._placeHolderNameCounts[base] = next;

    return name;
  }
}