import {
  Component,
  Input,
  ViewChildren,
  QueryList,
  OnInit
} from '@angular/core';
import { AbstractControl, FormArray, FormControl } from '@angular/forms';
import {
  BaseControlValueAccessor,
  createControlValueAccessorProviders
} from '../base-control-value-accessor';
import { SearchParameter } from 'src/app/types/search.parameter';
import { SearchParameterComponent } from '../search-parameter/search-parameter.component';
import { SearchCondition } from '../../types/search.condition';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { FhirBackendService } from '../../shared/fhir-backend/fhir-backend.service';

/**
 * Component for managing search parameters of a resource type
 */
@Component({
  selector: 'app-search-parameter-group',
  templateUrl: './search-parameter-group.component.html',
  styleUrls: ['./search-parameter-group.component.less'],
  providers: createControlValueAccessorProviders(SearchParameterGroupComponent)
})
export class SearchParameterGroupComponent
  extends BaseControlValueAccessor<SearchParameter[]>
  implements OnInit {
  @ViewChildren(SearchParameterComponent)
  searchParameterComponents: QueryList<SearchParameterComponent>;
  parameterList = new FormArray([]);
  resourceType: FormControl = new FormControl('');
  resourceTypes: string[] = [];
  filteredResourceTypes: Observable<string[]>;
  resourceTypeSet = false;
  definitions: any;

  constructor(private fhirBackend: FhirBackendService) {
    super();
    this.parameterList.valueChanges.subscribe((value) => {
      this.onChange(value);
    });
  }

  ngOnInit(): void {
    this.filteredResourceTypes = this.resourceType.valueChanges.pipe(
      startWith(''),
      map((value) => this._filter(value, this.resourceTypes))
    );
    this.resourceType.valueChanges.subscribe((value) => {
      const match = this.resourceTypes.find((rt) => rt === value);
      if (match) {
        this.resourceTypeSet = true;
      }
    });
    this.definitions = this.fhirBackend.getCurrentDefinitions();
    this.resourceTypes = Object.keys(this.definitions.resources);
  }

  private _filter(
    value: string,
    options: string[],
    selected: string[] = null
  ): string[] {
    const filterValue = value.toLowerCase();

    return options.filter(
      (option) =>
        option.toLowerCase().includes(filterValue) &&
        (selected ? selected.indexOf(option) === -1 : true)
    );
  }

  /**
   * Add new search parameter to search parameter list
   */
  public addParameter(): void {
    this.parameterList.push(new FormControl({}));
  }

  /**
   * Remove search parameter from search parameter list
   */
  public removeParameter(item: AbstractControl): void {
    this.parameterList.removeAt(this.parameterList.controls.indexOf(item));
  }

  writeValue(value: SearchParameter[]): void {
    // TODO
  }

  // Get and group search conditions for a resource type.
  getConditions(): SearchCondition {
    const conditions = this.searchParameterComponents
      .map((c) => c.getCriteria())
      .join('');
    return {
      resourceType: this.resourceType.value,
      criteria: conditions
    };
  }
}
