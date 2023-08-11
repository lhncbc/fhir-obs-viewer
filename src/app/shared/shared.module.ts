import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FhirBackendModule } from './fhir-backend/fhir-backend.module';
import { CommonSvgIconsModule } from './common-svg-icons/common-svg-icons.module';
import { ColumnDescriptionsModule } from './column-descriptions/column-descriptions.module';
import { CustomDialogModule } from './custom-dialog/custom-dialog.module';
import { AlertDialogModule } from './alert-dialog/alert-dialog.module';
import { SignInDialogModule } from './sign-in-dialog/sign-in-dialog.module';

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    FhirBackendModule,
    CommonSvgIconsModule,
    ColumnDescriptionsModule,
    CustomDialogModule,
    AlertDialogModule,
    SignInDialogModule
  ]
})
export class SharedModule {}
