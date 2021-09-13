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
  let result;
  return (
    response.link.some(
      (link) => link.relation === 'next' && (result = link.url)
    ) && result
  );
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
 * Gets a list containing the word itself and its synonyms, if any.
 */
export function getWordSynonyms(
  wordSynonyms: string[][],
  str: string
): string[] {
  if (!str) {
    return [''];
  }
  const match = wordSynonyms.find((x) => x.includes(str));
  return match ? match : [str];
}

/**
 * Prepares a string for searching together with word synonyms.
 * example: 'AB' => 'AB,ANTIBODY,ANTIBODIES'.
 * example: 'AB TITR' => 'AB TITR,ANTIBODY TITR,ANTIBODIES TITR'.
 */
export function modifyStringForSynonyms(
  wordSynonyms: string[][],
  str: string
): string {
  if (!str) {
    return str;
  }
  return str
    .toUpperCase()
    .split(' ')
    .map((x) => getWordSynonyms(wordSynonyms, x))
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
