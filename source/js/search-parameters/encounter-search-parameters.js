// See https://www.hl7.org/fhir/encounter.html#search for description of Encounter search parameters

import { humanNameToString } from "../common/utils";
import {
  dateParameters,
  referenceParameters,
  stringParameters,
  valueSetsParameters
} from "./common-descriptions";

/**
 * Mapping from search parameter names to observation table column names.
 * If the name of the search parameter is not mentioned in this mapping,
 * this means that the column has the same name.
 */
const searchNameToColumn = {
};

/**
 * Mapping from observation table column names to resource element names.
 * If the column name of the observation table is not mentioned in this mapping,
 * this means that the name of the resource element has the same name.
 */
const columnToResourceElementName = {
};

export const ENCOUNTER = 'Encounter';

export const EncounterSearchParameters = () => ({
  // The resource type (for which these search parameters) is used for retrieving entered data from the SearchParameters component
  resourceType: ENCOUNTER,
  // Description of Encounter search parameters:
  // column - this value specifies the column name (of the HTML table of the observation data) to show, sometimes could be array of column names
  // getControlsHtml - creates controls for input parameter value(s)
  // attachControls - initializes controls
  // detachControls - removes links to controls
  // getCondition - returns URL parameters string with search condition according to value in controls
  // all functions have parameter searchItemId - generic id for DOM
  description: {
    // String search parameters:
    // [<display name>, <placeholder>, <search parameter name>]
    ...stringParameters([
      // TODO: These parameters should use autocompleter or something like that, but for now they use input type=text:
      ['Account', 'Accounts for billing for an Encounter', 'account'],
      ['Appointment(reference)', 'Accounts for billing for an Encounter', 'appointment'],
      ['Based on', 'The ServiceRequest that initiated this encounter', 'based-on'],
      ['Diagnosis', 'The diagnosis or procedure relevant to the encounter', 'diagnosis'],
      ['Episode of care', 'Episode(s) of care that this encounter should be recorded against', 'episode-of-care'],
      ['Location', 'Location the encounter takes place', 'location'],
      ['Part of', 'Another Encounter this encounter is part of', 'part-of'],
      ['Participant', 'Persons involved in the encounter other than the patient', 'participant'],
      ['Reason code', 'Coded reason the encounter takes place', 'reason-code'],
      ['Reason reference', 'Reason the encounter takes place (reference)', 'reason-reference'],
      ['Service provider', 'The organization (facility) responsible for this encounter', 'service-provider'],
      ['Subject', 'The patient or group present at the encounter', 'subject'],
      // TODO: Search by "identifier" doesn't work now, should be replaced with "_id" ??
      ['Identifier', 'encounter identifier', 'identifier'],
      ['Length', 'length of encounter in days', 'length'],
    ], searchNameToColumn),

    // Search parameters with predefined value set:
    // [<display name>, <placeholder>, <search parameter name>, <set of values|value path to get list from FHIR specification>]
    ...valueSetsParameters([
      ['Class', 'Classification of patient encounter', 'class', 'Encounter.class'],
      ['Participant type', 'Role of participant in encounter', 'participant-type', 'Encounter.participant.type'],
      ['Status', 'Encounter status', 'status', 'Encounter.status'],
      ['Type', 'Encounter type', 'type', 'Encounter.type'],
      ['Special arrangement', 'Wheelchair, translator, stretcher, etc.', 'special-arrangement', 'Encounter.hospitalization.specialArrangement']
    ], searchNameToColumn),

    // Date search parameters:
    // [<display name>, <search parameter name>]
    ...dateParameters([
      ['A date within the period the Encounter lasted', 'date'],
      ['Time period during which the patient was present at the location', 'location-period']
    ], searchNameToColumn),


    // Reference search parameters:
    // [<display name>, <placeholder>, <resource type>, <resource param filter name>, <map function>, <search parameter name>]
    // TODO: It is unclear which criteria should be used for parameters of reference type
    // TODO: We need a separate search form or a set of search parameters for each parameter of the reference type?
    ...referenceParameters([
      ['Practitioner', 'Persons involved in the encounter other than the patient', 'Practitioner', 'name', item => humanNameToString(item.resource.name), 'practitioner']
    ], searchNameToColumn)

  },

  columnToResourceElementName
});
