import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { ReactiveFormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { SearchParameterComponent } from './search-parameter.component';
import { ObservationCodeLookupModule } from '../observation-code-lookup/observation-code-lookup.module';
import { DatesFromToComponent } from './dates-from-to.component';
import { ObservationTestValueComponent } from './observation-test-value.component';
import { MatSelectModule } from '@angular/material/select';
import { AutocompleteParameterValueComponent } from './autocomplete-parameter-value.component';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ObservationTestValueUnitComponent } from './observation-test-value-unit/observation-test-value-unit.component';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormControlCollectorModule } from '../../shared/error-manager/form-control-collector.module';
import { TabToSelectModule } from '../../shared/tab-to-select/tab-to-select.module';
import { MatRadioModule } from '@angular/material/radio';
import { AutocompleteModule } from '../autocomplete/autocomplete.module';
import { EvidenceVariableValueComponent } from './evidence-variable-value.component';

@NgModule({
  declarations: [
    SearchParameterComponent,
    DatesFromToComponent,
    AutocompleteParameterValueComponent,
    ObservationTestValueComponent,
    ObservationTestValueUnitComponent,
    EvidenceVariableValueComponent
  ],
  exports: [SearchParameterComponent],
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatAutocompleteModule,
    ReactiveFormsModule,
    FormControlCollectorModule,
    MatInputModule,
    ObservationCodeLookupModule,
    MatSelectModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    TabToSelectModule,
    MatRadioModule,
    AutocompleteModule
  ]
})
export class SearchParameterModule {}
