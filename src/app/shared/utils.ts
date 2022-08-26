/**
 * This file exports utility functions meant for common use
 * Please add future utility methods here (as top-level exports)
 */

import Bundle = fhir.Bundle;

/**
 * Capitalize the first char and return the string
 */
export function capitalize(str: string): string {
  return str && str.charAt(0).toUpperCase() + str.substring(1);
}

/**
 * Extracts next page URL from a bundle (see: https://www.hl7.org/fhir/http.html#paging)
 */
export function getNextPageUrl(response: Bundle): string | undefined {
  return response.link?.find((l) => l.relation === 'next')?.url || null;
}

/**
 * Escapes a FHIR search parameter string
 * (see https://www.hl7.org/fhir/search.html#escaping)
 */
export function escapeFhirSearchParameter(str: string): string {
  return str.replace(/[$,|]/g, '\\$&');
}

/**
 * Escapes a FHIR search parameter string then encode it with encodeURIComponent
 * (see https://www.hl7.org/fhir/search.html#escaping)
 */
export function encodeFhirSearchParameter(str): string {
  return encodeURIComponent(escapeFhirSearchParameter(str));
}

/**
 * Prepares a string for insertion into a regular expression
 */
export function escapeStringForRegExp(str: string): string {
  return str.replace(/[-[\]{}()*+?.,\\/^$|#\s]/g, '\\$&');
}

/**
 * Converts a CSV string to an array of arrays of cell values, if possible,
 * Otherwise returns null.
 * The idea of code borrowed from https://gist.github.com/Jezternz/c8e9fafc2c114e079829974e3764db75
 */
export function csvStringToArray(csvString: string): string[][] | null {
  const re = /(,|\r?\n|\r|^)(?:"([^"]*(?:""[^"]*)*)"|([^,\r\n]*))/gi;
  const result = [[]];
  let lastIndex = 0;
  let matches;
  // tslint:disable-next-line:no-conditional-assignment
  while ((matches = re.exec(csvString))) {
    if (matches[1].length && matches[1] !== ',') {
      result.push([]);
    }
    result[result.length - 1].push(
      matches[2] !== undefined ? matches[2].replace(/""/g, '"') : matches[3]
    );
    lastIndex = re.lastIndex;
  }
  return lastIndex === csvString.length ? result : null;
}

/**
 * Prepares a string for searching together with word synonyms.
 * example: 'AB' => 'AB,ANTIBODY,ANTIBODIES'.
 * example: 'AB TITR' => 'AB TITR,ANTIBODY TITR,ANTIBODIES TITR'.
 */
export function modifyStringForSynonyms(
  wordSynonyms: object,
  str: string
): string {
  if (!str) {
    return str;
  }
  return str
    .toUpperCase()
    .split(' ')
    .map((x) => wordSynonyms[x] || [x])
    .reduce(
      (prev: string[], curr: string[]) => {
        return [].concat(
          ...prev.map((x) => curr.map((y) => (x ? `${x} ${y}` : y)))
        );
      },
      ['']
    )
    .join(',');
}

/**
 * Generates a lookup object from synonyms json array, for faster retrieval.
 */
export function generateSynonymLookup(synonyms: string[][]): object {
  const lookup = {};
  synonyms.forEach((x) => {
    x.forEach((y) => {
      lookup[y] = x;
    });
  });
  return lookup;
}

const focusableSelector = [
  '*[tabIndex]:not([tabIndex="-1"])',
  'a[href]:not([disabled])',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input[type="date"]:not([disabled])',
  'input[type="text"]:not([disabled])',
  'input:not([type]):not([disabled])',
  'input[type="radio"]:not([disabled])',
  'input[type="checkbox"]:not([disabled])',
  'select:not([disabled])'
].join(',');

/**
 * Returns true if HTML element is visible.
 */
function isVisible(element: HTMLElement): boolean {
  return window.getComputedStyle(element).display !== 'none';
}

/**
 * Returns focusable children of HTML element.
 */
export function getFocusableChildren(element: HTMLElement): HTMLElement[] {
  return [].slice
    .call(element.querySelectorAll(focusableSelector))
    .filter((child) => isVisible(child));
}

/**
 * Returns the value of the specified parameter from the current URL
 * @param name - parameter name
 */
export function getUrlParam(name): string {
  if (window.URLSearchParams !== undefined) {
    const params = new URLSearchParams(window.location.search);
    return params.has(name) ? decodeURIComponent(params.get(name)) : null;
  }

  // IE does not support URLSearchParams
  const queryMatch = window.location.search.match(
    new RegExp(`[?&]${escapeStringForRegExp(name)}=([^&]+)`, 'i')
  );
  return queryMatch && queryMatch.length
    ? decodeURIComponent(queryMatch[1])
    : null;
}

/**
 * Returns a new URL from the current URL, adding a new parameter or
 * updating an existing one.
 * @param name - parameter name
 * @param value - parameter value
 */
export function setUrlParam(name, value): string {
  const urlParts = window.location.href
    .split(/[?&]/)
    .filter((paramStr) => !paramStr.startsWith(name + '='));
  return (
    urlParts[0] +
    '?' +
    urlParts
      .slice(1)
      .concat([name + '=' + encodeURIComponent(value)])
      .join('&')
  );
}

/**
 * Returns plural form of resource type name.
 */
export function getPluralFormOfResourceType(resourceType: string): string {
  return resourceType.replace(/(.*)(.)/, (_, $1, $2) => {
    if ($2 === 'y') {
      return $1 + 'ies';
    }
    return _ + 's';
  });
}

// Map a resource type to a user-friendly record name
const resourceType2RecordName = {
  ResearchStudy: 'Study'
};
/**
 * Returns record name (user friendly name for resource type).
 * @param resourceType - resource type
 */
export function getRecordName(resourceType: string): string {
  return resourceType2RecordName[resourceType] || resourceType;
}

/**
 * Returns plural form of record name (user-friendly name for resource type).
 */
export function getPluralFormOfRecordName(resourceType: string): string {
  return getPluralFormOfResourceType(getRecordName(resourceType));
}
