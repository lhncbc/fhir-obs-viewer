import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { SearchParameter } from 'src/app/types/search.parameter';
import {
  BaseControlValueAccessor,
  createControlValueAccessorProviders
} from '../base-control-value-accessor';
import { FhirBackendService } from '../../shared/fhir-backend/fhir-backend.service';
import { isEqual } from 'lodash-es';
import {
  QueryParamsService,
  OBSERVATIONBYTEST
} from '../../shared/query-params/query-params.service';

/**
 * Component for editing one resource search parameter
 */
@Component({
  selector: 'app-search-parameter',
  templateUrl: './search-parameter.component.html',
  styleUrls: ['./search-parameter.component.less'],
  providers: createControlValueAccessorProviders(SearchParameterComponent)
})
export class SearchParameterComponent
  extends BaseControlValueAccessor<SearchParameter>
  implements OnInit {
  @Input() resourceType = '';
  @Input() isPullData = false;
  readonly OBSERVATIONBYTEST = OBSERVATIONBYTEST;
  readonly OBSERVATIONBYTESTDESC =
    'The display text associated with the code of the observation type';
  definitions: any;

  selectedResourceType: any;

  parameterName: FormControl = new FormControl('', Validators.required);
  parameters: any[] = [];
  filteredParameters: Observable<any[]>;
  selectedParameter: any;
  currentValue = null;

  parameterValue: FormControl = new FormControl('', (control) =>
    this.isPullData || this.selectedObservationCodes?.value?.datatype
      ? null
      : Validators.required(control)
  );
  parameterValues: any[];

  selectedObservationCodes: FormControl = new FormControl(null, () =>
    this.isPullData || this.selectedObservationCodes?.value?.datatype
      ? null
      : { required: true }
  );
  loincCodes: string[] = [];

  @ViewChild('searchParamName') searchParamName: ElementRef;

  get value(): SearchParameter {
    return {
      element: this.selectedParameter?.element || '',
      value: this.parameterValue.value,
      selectedObservationCodes: this.selectedObservationCodes.value
    };
  }

  /**
   * Whether to use lookup control for search parameter value.
   */
  get useLookupParamValue(): boolean {
    return this.queryParams.getUseLookupParamValue(this.selectedParameter);
  }

  constructor(
    private fhirBackend: FhirBackendService,
    private queryParams: QueryParamsService
  ) {
    super();
  }

  ngOnInit(): void {
    this.definitions = this.fhirBackend.getCurrentDefinitions();
    this.selectedResourceType = this.definitions.resources[this.resourceType];
    this.parameters = this.selectedResourceType.searchParameters;
    this.selectedParameter = null;

    this.filteredParameters = this.parameterName.valueChanges.pipe(
      startWith(''),
      map((value) => this._filter(value, this.parameters))
    );

    this.parameterName.valueChanges.subscribe((value) => {
      this.selectedParameter = this.selectedResourceType.searchParameters.find(
        (p) => p.displayName === value
      );
      if (this.selectedParameter) {
        this.parameterValue.setValue(
          this.selectedParameter.type === 'boolean' ? 'true' : ''
        );
        if (this.selectedParameter.valueSet) {
          this.parameterValues = this.definitions.valueSets[
            this.selectedParameter.valueSet
          ];
        }
      }
      this.handleChange();
    });

    this.parameterValue.valueChanges.subscribe(() => {
      this.handleChange();
    });
    this.selectedObservationCodes.valueChanges.subscribe((value) => {
      // Prepare a list of LOINC codes for ObservationTestValueUnitComponent
      this.loincCodes =
        value?.coding
          .filter((c) => c.system === 'http://loinc.org')
          .map((c) => c.code) || [];
      this.handleChange();
    });
  }

  /**
   * Notify ngModel or FormControl linked with component when a control's value
   * changes only if the value is really changed.
   */
  handleChange(): void {
    const newValue = this.value;

    if (!isEqual(this.currentValue, newValue)) {
      this.onChange(newValue);
      this.currentValue = newValue;
    }
  }

  private _filter(value: string, options: any[]): string[] {
    const filterValue = value.toLowerCase();

    return options.filter((option) =>
      option.displayName.toLowerCase().includes(filterValue)
    );
  }

  /**
   * Part of the ControlValueAccessor interface
   * required to integrate with Angular's core forms API.
   *
   * @param value New value to be written to the model.
   */
  writeValue(value: SearchParameter): void {
    const param = this.parameters.find((p) => p.element === value?.element);
    this.parameterName.setValue(param?.displayName || '');
    if (this.isPullData) {
      this.parameterName.disable({ emitEvent: false });
    }
    this.parameterValue.setValue(value?.value || '');
    this.selectedObservationCodes.setValue(
      value?.selectedObservationCodes || null
    );
  }

  /**
   * get string of url segment describing the search criteria that will be used to search in server.
   */
  getCriteria(): string {
    return this.queryParams.getQueryParam(this.resourceType, this.value);
  }

  /**
   * Focus "Search parameter name" control.
   * This is being called from parent component when the "Add {resource type} criterion" button is clicked.
   */
  focusSearchParamNameInput(): void {
    this.searchParamName.nativeElement.focus();
  }
}
