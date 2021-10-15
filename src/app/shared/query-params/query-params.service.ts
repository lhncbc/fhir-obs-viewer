import { Injectable } from '@angular/core';
import { SearchParameter } from '../../types/search.parameter';
import { encodeFhirSearchParameter, escapeFhirSearchParameter } from '../utils';
import { FhirBackendService } from '../fhir-backend/fhir-backend.service';

export const OBSERVATIONBYTEST = 'code text';
export const CODETYPES = ['code', 'CodeableConcept', 'Coding'];

/**
 * Query type
 * @enum {number}
 */
export enum QueryType {
  /**
   * Regular query e.g. '&code=123&value=gt10'
   */
  regular = 0,
  /**
   * Filter query e.g. 'code eq 123 and value gt 10'
   * See https://www.hl7.org/fhir/search_filter.html
   */
  filter
}

@Injectable({
  providedIn: 'root'
})
export class QueryParamsService {
  private get definitions(): any {
    return this.fhirBackend.getCurrentDefinitions();
  }

  constructor(private fhirBackend: FhirBackendService) {}

  /**
   * Returns string of url segment describing the search criteria that will be used to search in server.
   * @param resourceType - resource type
   * @param value - search parameter value
   * @param type - type of query
   */
  getQueryParam(
    resourceType: string,
    value: SearchParameter,
    type = QueryType.regular
  ): string {
    const selectedParameter = this.definitions.resources[
      resourceType
    ].searchParameters.find((p) => p.element === value?.element);
    // If it is not a search parameter
    // (e.g. element === '_has:ResearchSubject:individual:study'),
    // use the default template
    if (!selectedParameter) {
      return `&${value.element}=${value.value}`;
    }
    if (selectedParameter.element === OBSERVATIONBYTEST) {
      return this.getObservationCodeTextCriteria(value, type);
    }
    if (selectedParameter.type === 'date') {
      return (
        (value.value.from
          ? `&${selectedParameter.element}=ge${value.value.from}`
          : '') +
        (value.value.to
          ? `&${selectedParameter.element}=le${value.value.to}`
          : '')
      );
    }
    if (
      resourceType === 'Patient' &&
      selectedParameter.element === 'active' &&
      value.value === 'true'
    ) {
      // Include patients with active field not defined when searching active patients
      return '&active:not=false';
    }
    if (this.getUseLookupParamValue(selectedParameter)) {
      return `&${selectedParameter.element}=${value.value.join(',')}`;
    }
    if (selectedParameter.type === 'Quantity') {
      const testValueCriteria = this.getCompositeTestValueCriteria(
        value.value,
        type
      );
      return testValueCriteria
        ? `&${selectedParameter.element}${testValueCriteria}`
        : '';
    }
    return `&${selectedParameter.element}=${value.value}`;
  }

  /**
   * Get criteria string for Observation "code text" parameter
   */
  private getObservationCodeTextCriteria(
    value: SearchParameter,
    type: QueryType
  ): string {
    const selectedCodes = value.selectedObservationCodes;
    // Ignore criteria if no code selected.
    if (!selectedCodes) {
      return '';
    }
    const coding = selectedCodes.coding.filter((c) => c);
    const codeParam = coding.length
      ? '&combo-code=' +
        coding.map((code) => encodeFhirSearchParameter(code.code)).join(',')
      : '';
    const valueParamName = {
      CodeableConcept: 'combo-value-concept',
      Quantity: 'combo-value-quantity',
      string: 'value-string'
    }[selectedCodes.datatype];
    const testValueCriteria = this.getCompositeTestValueCriteria(
      value.value,
      type
    );
    const valueParam = testValueCriteria
      ? `&${valueParamName}${testValueCriteria}`
      : '';
    return `${codeParam}${valueParam}`;
  }

  /**
   * Get criteria string for composite test value controls
   * e.g. prefix + value + unit
   */
  private getCompositeTestValueCriteria(value: any, type: QueryType): string {
    const modifier = value.testValueModifier;
    const prefix = value.testValuePrefix;
    const testValue = value.testValue
      ? escapeFhirSearchParameter(value.testValue.toString())
      : '';
    const unit = value.testValueUnit;
    return testValue.trim()
      ? `${modifier}=${prefix}${encodeURIComponent(
          testValue + (unit ? '||' + escapeFhirSearchParameter(unit) : '')
        )}`
      : '';
  }

  /**
   * Whether to use lookup control for search parameter value.
   */
  getUseLookupParamValue(selectedParameter: any): boolean {
    const parameterValues = this.definitions.valueSets[
      selectedParameter.valueSet
    ];
    return (
      CODETYPES.includes(selectedParameter.type) &&
      Array.isArray(parameterValues) &&
      parameterValues.length > 0
    );
  }
}
