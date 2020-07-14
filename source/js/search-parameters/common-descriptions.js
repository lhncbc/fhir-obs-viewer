import { FhirBatchQuery } from '../common/fhir-batch-query';
import { getAutocompleterById } from '../common/utils';
import { default as searchParameterDefinitions } from 'definitions';

// Common FhirBatchQuery to execute queries from search parameter controls
let client;

// FHIR version
let fhirVersion;

export function setFhirServerForSearchParameters(serviceBaseUrl) {
  client = null;
  const newClient = new FhirBatchQuery({serviceBaseUrl, maxRequestsPerBatch: 1});
  return newClient.getWithCache('metadata').then(({data}) => {
    fhirVersion = data.fhirVersion;
    if (!searchParameterDefinitions.versionNameByNumber[fhirVersion]) {
      return Promise.reject({error: 'Unsupported FHIR version: ' + fhirVersion})
    } else {
      client = newClient;
    }
  })
}

export function getCurrentClient() {
  return client;
}

/**
 * Generates boolean parameter description
 * @param {string} description - description for checkbox field,
 * @param {Object} column - HTML table column name
 * @param {string} name - name of search parameter to construct result query string
 * @return {Object}
 */
function booleanParameterDescription({ description, column, name }) {
  return {
    column,
    getControlsHtml: (searchItemId) =>
      `<label class="boolean-param"><input id="${searchItemId}-${name}" type="checkbox">${description}</label>`,
    getCondition: (searchItemId) =>
      `&${name}=${document.getElementById(`${searchItemId}-${name}`).checked}`
  };
}

/**
 * Generates string parameter description
 * @param {string} placeholder - placeholder for input field,
 * @param {Object} column - HTML table column name
 * @param {string} name - name of search parameter to construct result query string
 * @return {Object}
 */
function stringParameterDescription({ placeholder, column, name }) {
  return {
    column,
    getControlsHtml: (searchItemId) =>
      `<input type="text" style="width:100%" id="${searchItemId}-${name}" placeholder="${placeholder}" title="${placeholder}">`,
    getCondition: (searchItemId) => {
      const value = document.getElementById(`${searchItemId}-${name}`).value;
      return value.trim() ? `&${name}=${encodeURIComponent(value)}` : '';
    }
  }
}

/**
 * Generates date parameter description
 * @param {string} description - title for input field,
 * @param {Object} column - HTML table column name
 * @param {string} name - name of search parameter to construct result query string
 * @return {Object}
 */
function dateParameterDescription({name, column, description}) {
  return {
    column,
    getControlsHtml: (searchItemId) => {
      const title = description && description.replace(/"/g, '&quot;') || '';
      return `\
from <input type="date" id="${searchItemId}-${name}-from" placeholder="no limit" title="${title}">
to <input type="date" id="${searchItemId}-${name}-to" placeholder="no limit" title="${title}"></td>`;
    },
    getCondition: (searchItemId) => {
      const from = document.getElementById(`${searchItemId}-${name}-from`).value;
      const to = document.getElementById(`${searchItemId}-${name}-to`).value;

      return (from ? `&${name}=ge${encodeURIComponent(from)}` : '')
        + (to ? `&${name}=le${encodeURIComponent(to)}` : '');
    }
  };
}

/**
 * Generates search parameters from data imported from FHIR specification on build step by webpack loader.
 * Available resource types are specified in webpack.common.js
 * @param {string} resourceType - resource type for which you want to generate search parameters
 * @param {Object} searchNameToColumn - mapping from search parameter names to HTML table column names
 * @param {Array<string>} skip - an array of search parameter names to skip, if you want to define them manually
 * @return {Object}
 */
export function defaultParameters(resourceType, {searchNameToColumn = {}, skip = []} = {}) {
  const versionName = searchParameterDefinitions.versionNameByNumber[fhirVersion];

  return searchParameterDefinitions.configByVersionName[versionName][resourceType].reduce((_parameters, item) => {
    if(skip.indexOf(item.name) === -1) {
      const displayName = item.name.charAt(0).toUpperCase() + item.name.substring(1).replace(/-/g, ' ');
      const placeholder = item.description;
      const name = item.name;

      switch(item.type) {
        case 'date':
        case 'dateTime':
          _parameters[displayName] = dateParameterDescription({
            description: item.description,
            name,
            column: searchNameToColumn[name] || name
          });
          break;
        case 'boolean':
          _parameters[displayName] = booleanParameterDescription({
            description: item.description,
            name,
            column: searchNameToColumn[name] || name
          });
          break;
        // TODO: find a way to support other types
        default:
          // all other criteria are considered to have a string type
          _parameters[displayName] = stringParameterDescription({
            placeholder,
            name,
            column: searchNameToColumn[name] || name
          });
      }
    }

    return _parameters;
  }, {});
}

/**
 * Generates string parameter descriptions
 * @param {Array[]} descriptions - an array of descriptions, each of which is an array containing the following elements:
 *                  displayName - parameter display name,
 *                  placeholder - placeholder for input field,
 *                  name - name of search parameter to construct result query string
 * @param {Object} searchNameToColumn - mapping from search parameter names to HTML table column names
 * @return {Object}
 */
export function stringParameters(descriptions, searchNameToColumn) {
  return descriptions.reduce((_parameters, [displayName, placeholder, name]) => {
    _parameters[displayName] = stringParameterDescription({
      placeholder,
      name,
      column: searchNameToColumn[name] || name
    });
    return _parameters;
  }, {});
}

/**
 * Generates descriptions for parameters with a predefined set of values
 * @param {Array[]} descriptions - an array of descriptions, each of which is an array containing the following elements:
 *                  displayName - parameter display name,
 *                  placeholder - placeholder for input field,
 *                  name - name of search parameter to construct result query string
 *                  list - array of predefined values (see value-sets.js)
 * @param {Object} searchNameToColumn - mapping from search parameter names to HTML table column names
 * @return {Object}
 */
export function valueSetsParameters(descriptions, searchNameToColumn) {
  return descriptions.reduce((_parameters, [displayName, placeholder, name, list]) => {
    _parameters[displayName] = {
      column: searchNameToColumn[name] || name,
      getControlsHtml: (searchItemId) =>
        `<input type="text" id="${searchItemId}-${name}" placeholder="${placeholder}">`,
      attachControls: (searchItemId) => {
        new Def.Autocompleter.Prefetch(`${searchItemId}-${name}`, list.map(item => item.display), {
          codes: list.map(item => item.code),
          maxSelect: '*',
          matchListValue: true
        });
      },
      detachControls: (searchItemId) => {
        getAutocompleterById(`${searchItemId}-${name}`).destroy();
      },
      getCondition: (searchItemId) => {
        const codes = getAutocompleterById(`${searchItemId}-${name}`).getSelectedCodes().join(',');
        return codes ? `&${name}=${encodeURIComponent(codes)}` : '';
      }
    };
    return _parameters;
  }, {});
}

/**
 * Generates date parameter descriptions
 * @param {Array[]} descriptions - an array of descriptions, each of which is an array containing the following elements:
 *                  displayName - parameter display name,
 *                  name - name of search parameter to construct result query string
 * @param {Object} searchNameToColumn - mapping from search parameter names to HTML table column names
 * @return {Object}
 */
export function dateParameters(descriptions, searchNameToColumn) {
  return descriptions.reduce((_parameters, [displayName, name]) => {
    _parameters[displayName] = dateParameterDescription({
      name,
      column: searchNameToColumn[name] || name
    });

    return _parameters;
  }, {});
}

/**
 * Generates descriptions for parameters with a set of loadable values
 * @param {Array[]} descriptions - an array of descriptions, each of which is an array containing the following elements:
 *                  displayName - parameter display name,
 *                  placeholder - placeholder for input field,
 *                  resourceType - FHIR resource type,
 *                  filterName - query parameter name for filtering resources by string,
 *                  itemToString - function to convert an resource item to a string,
 *                  name - name of search parameter to construct result query string
 * @param {Object} searchNameToColumn - mapping from search parameter names to HTML table column names
 * @return {Object}
 */
export function referenceParameters(descriptions, searchNameToColumn) {
  return descriptions.reduce((_parameters, [displayName, placeholder, resourceType, filterName, itemToString, name]) => {
    _parameters[displayName] = {
      column: searchNameToColumn[name] || name,
      getControlsHtml: (searchItemId) =>
        `<input type="text" id="${searchItemId}-${name}" placeholder="${placeholder}">`,
      attachControls: (searchItemId) => {
        new Def.Autocompleter.Search(`${searchItemId}-${name}`, null, {
          fhir: {
            search: function (fieldVal, count) {
              return {
                then: function (success, error) {
                  getCurrentClient().getWithCache(`${resourceType}?${filterName}=${fieldVal}&_count=${count}`)
                    .then(({status, data}) => {
                      if (status === 200) {
                        success({
                          "resourceType": "ValueSet",
                          "expansion": {
                            "total": data.total,
                            "contains": (data.entry || []).map(item => ({
                              code: /*resourceType + '/' + */item.resource.id,
                              display: itemToString(item)
                            }))
                          }
                        })
                      } else {
                        error(data);
                      }
                    });
                }
              };
            }
          },
          maxSelect: '*',
          matchListValue: true
        });
      },
      detachControls: (searchItemId) => {
        getAutocompleterById(`${searchItemId}-${name}`).destroy();
      },
      getCondition: (searchItemId) => {
        const codes = getAutocompleterById(`${searchItemId}-${name}`).getSelectedCodes().join(',');
        return codes ? `&${name}=${encodeURIComponent(codes)}` : '';
      }
    };
    return _parameters;
  }, {});
}
