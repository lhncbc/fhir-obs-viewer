import { Component, OnDestroy, ViewChild } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatStepper } from '@angular/material/stepper';
import {
  ConnectionStatus,
  FhirBackendService
} from '../../shared/fhir-backend/fhir-backend.service';
import { ColumnDescriptionsService } from '../../shared/column-descriptions/column-descriptions.service';
import { filter, take } from 'rxjs/operators';
import { Subject, Subscription } from 'rxjs';
import { saveAs } from 'file-saver';
import { ViewCohortPageComponent } from '../step-3-view-cohort-page/view-cohort-page.component';
import { SearchParameter } from '../../types/search.parameter';
import Resource = fhir.Resource;

/**
 * The main component provides a wizard-like workflow by dividing content into logical steps.
 */
@Component({
  selector: 'app-stepper',
  templateUrl: './stepper.component.html',
  styleUrls: ['./stepper.component.less']
})
export class StepperComponent implements OnDestroy {
  @ViewChild('stepper') private myStepper: MatStepper;
  @ViewChild('defineCohortComponent') public defineCohortComponent;
  @ViewChild('viewCohortComponent')
  public viewCohortComponent: ViewCohortPageComponent;

  settings: FormControl = new FormControl();
  defineCohort: FormControl = new FormControl();
  serverInitialized = false;
  subscription: Subscription;

  constructor(
    public columnDescriptions: ColumnDescriptionsService,
    private fhirBackend: FhirBackendService
  ) {
    this.subscription = fhirBackend.initialized
      .pipe(
        filter((status) => status === ConnectionStatus.Ready),
        take(1)
      )
      .subscribe(() => {
        this.serverInitialized = true;
      });
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    this.columnDescriptions.destroy();
  }

  saveCohort(): void {
    const objectToSave = {
      serviceBaseUrl: this.fhirBackend.serviceBaseUrl,
      maxPatientCount: this.defineCohortComponent.defineCohortForm.value
        .maxPatientsNumber,
      rawCriteria: this.defineCohortComponent.patientParams.parameterList.value,
      data:
        this.viewCohortComponent?.resourceTableComponent?.dataSource?.data || []
    };
    const blob = new Blob([JSON.stringify(objectToSave, null, 2)], {
      type: 'text/json;charset=utf-8',
      endings: 'native'
    });
    saveAs(blob, `cohort-${objectToSave.data.length}.json`);
  }

  /**
   * Process file and load criteria and patient list data.
   */
  loadCohort(event): void {
    if (event.target.files.length === 1) {
      const reader = new FileReader();
      const filename = event.target.files[0].name;
      reader.onload = (loadEvent) => {
        try {
          const blobData = JSON.parse(loadEvent.target.result as string);
          const {
            serviceBaseUrl,
            maxPatientCount,
            rawCriteria,
            data
          } = blobData;
          if (serviceBaseUrl !== this.fhirBackend.serviceBaseUrl) {
            throw new Error(
              'Inapplicable data, because it was downloaded from another server.'
            );
          }
          // Set max field value.
          this.defineCohortComponent.defineCohortForm
            .get('maxPatientsNumber')
            .setValue(maxPatientCount);
          // Set search parameter form values.
          (rawCriteria as SearchParameter[]).forEach((searchParam) => {
            this.defineCohortComponent.patientParams.parameterList.push(
              new FormControl(searchParam)
            );
          });
          // Set patient table data.
          this.loadPatientsData(data);
        } catch (e) {
          alert('Error: ' + e.message);
        }
      };
      reader.readAsText(event.target.files[0]);
    }
    event.target.value = '';
  }

  private loadPatientsData(data: Resource[]): void {
    this.defineCohortComponent.patientStream = new Subject<Resource>();
    this.myStepper.next();
    setTimeout(() => {
      data.forEach((resource) => {
        this.defineCohortComponent.patientStream.next(resource);
      });
      this.defineCohortComponent.patientStream.complete();
    });
  }
}
