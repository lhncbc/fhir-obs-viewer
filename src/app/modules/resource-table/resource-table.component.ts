import {
  Component,
  HostBinding,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SelectionModel } from '@angular/cdk/collections';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { ColumnDescription } from '../../types/column.description';
import { bufferCount, filter } from 'rxjs/operators';
import { escapeStringForRegExp } from '../../shared/utils';
import { ColumnDescriptionsService } from '../../shared/column-descriptions/column-descriptions.service';
import { ColumnValuesService } from '../../shared/column-values/column-values.service';
import { Subject, Subscription } from 'rxjs';
import { TableVirtualScrollDataSource } from 'ng-table-virtual-scroll';
import { SettingsService } from '../../shared/settings-service/settings.service';
import { Sort } from '@angular/material/sort';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import * as fhirpath from 'fhirpath';
import * as fhirPathModelR4 from 'fhirpath/fhir-context/r4';
import {
  ConnectionStatus,
  FhirBackendService
} from '../../shared/fhir-backend/fhir-backend.service';
import Resource = fhir.Resource;
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { ResourceTableFilterComponent } from '../resource-table-filter/resource-table-filter.component';

/**
 * Component for loading table of resources
 */
@Component({
  selector: 'app-resource-table',
  templateUrl: './resource-table.component.html',
  styleUrls: ['./resource-table.component.less']
})
export class ResourceTableComponent implements OnInit, OnChanges, OnDestroy {
  constructor(
    private fhirBackend: FhirBackendService,
    private http: HttpClient,
    private ngZone: NgZone,
    private columnDescriptionsService: ColumnDescriptionsService,
    private columnValuesService: ColumnValuesService,
    private settings: SettingsService,
    private liveAnnoncer: LiveAnnouncer,
    private dialog: MatDialog
  ) {
    this.subscription = fhirBackend.initialized
      .pipe(filter((status) => status === ConnectionStatus.Ready))
      .subscribe(() => {
        this.fhirPathModel = {
          R4: fhirPathModelR4
        }[fhirBackend.currentVersion];
        this.compiledExpressions = {};
      });
    this.listFilterColumns = settings.get('listFilterColumns');
  }

  /**
   * Get loading message according to loading status
   */
  get loadingMessage(): string {
    if (this.isLoading) {
      return 'Loading ...';
    } else if (this.dataSource.data.length === 0) {
      return `No matching ${this.resourceType} resources were found on the server.`;
    } else {
      return 'Loading complete.';
    }
  }

  /**
   * Get count message according to number of resources loaded
   */
  get countMessage(): string {
    if (this.dataSource.data.length === 0) {
      return '';
    } else {
      let output = '';
      if (this.enableSelection) {
        output += `Selected ${this.selectedResources.selected.length} out of `;
      }
      output += `${this.dataSource.data.length} rows loaded.`;
      return output;
    }
  }

  @Input() columnDescriptions: ColumnDescription[];
  @Input() enableClientFiltering = false;
  @Input() enableSelection = false;
  @Input() resourceType;
  @Input() context = '';
  @Input() resourceStream: Subject<Resource>;
  @Input() loadingStatistics: (string | number)[][] = [];
  columns: string[] = [];
  selectedResources = new SelectionModel<Resource>(true, []);
  filtersForm: FormGroup = new FormBuilder().group({});
  dataSource = new TableVirtualScrollDataSource<Resource>([]);
  lastResourceElement: HTMLElement;
  isLoading = true;
  loadTime = 0;
  loadedDateTime: number;
  subscription: Subscription;
  fhirPathModel: any;
  readonly listFilterColumns: string[];
  compiledExpressions: { [expression: string]: (row: Resource) => any };

  @HostBinding('class.fullscreen') fullscreen = false;

  /**
   * Whether it's a valid click event in accessibility sense.
   * A mouse click, The ENTER key or the SPACE key.
   */
  private static isA11yClick(event): boolean {
    if (event.type === 'click') {
      return true;
    }
    return (
      event.type === 'keydown' && (event.key === 'ENTER' || event.key === ' ')
    );
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  /**
   * Use columns present in bundle info as default, if empty column descriptions is passed in.
   * We show all columns with data on very first run of the application and when
   * the user doesn't select any columns to show in the column selection dialog.
   */
  private setColumnsFromBundle(): void {
    // Don't update if no data is available
    if (!this.dataSource.data.length) {
      return;
    }

    const allColumns = this.columnDescriptionsService.getAvailableColumns(
      this.resourceType,
      this.context
    );
    const hiddenByDefault = (
      this.settings.get('hideElementsByDefault')?.[this.resourceType] || []
    ).concat(this.settings.get('hideElementsByDefault')?.['*'] || []);
    // Remove columns without data.
    // Note: We check all rows, because the first row may
    // be missing columns that are in the second and subsequent ones.
    // For example, Patient.interpretation.
    // I also saw completely blank rows at the beginning of the ResearchStudy
    // table for dbGap, which was the main reason for checking all rows,
    // but now these lines are gone.
    this.columnDescriptions = allColumns.filter(
      (x) =>
        hiddenByDefault.indexOf(x.element) === -1 &&
        this.dataSource.data.some((row) => this.getCellStrings(row, x).length)
    );
    // Save column selections of default
    this.columnDescriptionsService.setVisibleColumnNames(
      this.resourceType,
      this.context,
      this.columnDescriptions.map((x) => x.element)
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    // update resource table if user searches again
    if (changes['resourceStream'] && changes['resourceStream'].currentValue) {
      this.dataSource.data.length = 0;
      this.isLoading = true;
      this.liveAnnoncer.announce(
        `The ${this.resourceType} resources loading process has started`
      );
      const startTime = Date.now();
      this.resourceStream.pipe(bufferCount(50)).subscribe(
        (resouceses) => {
          this.dataSource.data = this.dataSource.data.concat(resouceses);
          if (!this.columnDescriptions.length) {
            this.setColumnsFromBundle();
            this.setTableColumns();
          }
        },
        () => {},
        () => {
          this.loadedDateTime = Date.now();
          this.loadTime =
            Math.round((this.loadedDateTime - startTime) / 100) / 10;
          this.isLoading = false;
          this.liveAnnoncer.announce(
            `The ${this.resourceType} resources loading process has finished. ` +
              `${this.dataSource.data.length} rows loaded.`
          );
        }
      );
    }
    if (changes['columnDescriptions'] && this.columnDescriptions) {
      this.columns.length = 0;
      if (this.enableSelection) {
        this.columns.push('select');
      }
      if (!this.columnDescriptions.length) {
        this.setColumnsFromBundle();
      }
      this.setTableColumns();
    }
  }

  setTableColumns(): void {
    this.columns = this.columns.concat(
      this.columnDescriptions.map((c) => c.element)
    );
    if (this.enableClientFiltering) {
      this.filtersForm = new FormBuilder().group({});
      this.columnDescriptions.forEach((column) => {
        this.filtersForm.addControl(column.element, new FormControl(''));
      });
      this.dataSource.filterPredicate = ((data, filterValues) => {
        for (const [key, value] of Object.entries(filterValues)) {
          if (!value || (value as string[]).length === 0) {
            continue;
          }
          const columnDescription = this.columnDescriptions.find(
            (c) => c.element === key
          );
          const cellValue = this.getCellStrings(data, columnDescription);
          if (Array.isArray(value)) {
            if (!value.includes(cellValue.join('; '))) {
              return false;
            }
          } else {
            const reCondition = new RegExp(
              '\\b' + escapeStringForRegExp(value as string),
              'i'
            );
            if (!cellValue.some((item) => reCondition.test(item))) {
              return false;
            }
          }
        }
        return true;
        // casting method signature here because filterPredicate defines filter param as string
        // tslint:disable-next-line:variable-name
      }) as (BundleEntry, string) => boolean;
      this.filtersForm.valueChanges.subscribe((value) => {
        this.dataSource.filter = { ...value } as string;
      });
    }
  }

  /** Whether the number of selected elements matches the total number of rows. */
  isAllSelected(): boolean {
    const numSelected = this.selectedResources.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected === numRows;
  }

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  masterToggle(): void {
    this.isAllSelected()
      ? this.selectedResources.clear()
      : this.dataSource.data.forEach((row) =>
          this.selectedResources.select(row)
        );
  }

  /**
   * Deselect all rows.
   */
  clearSelection(): void {
    this.selectedResources.clear();
  }

  /**
   * Clear filters on all columns
   */
  clearColumnFilters(): void {
    this.filtersForm.reset();
  }

  /**
   * Toggle fullscreen mode
   */
  toggleFullscreen(): void {
    this.fullscreen = !this.fullscreen;
  }

  /**
   * Returns a function for evaluating the passed FHIRPath expression.
   * @param expression - FHIRPath expression
   */
  getEvaluator(expression: string): (row: Resource) => any {
    let compiledExpression = this.compiledExpressions[expression];
    if (!compiledExpression) {
      compiledExpression = fhirpath.compile(expression, this.fhirPathModel);
      this.compiledExpressions[expression] = compiledExpression;
    }
    return compiledExpression;
  }

  /**
   * Returns string values to display in a cell
   * @param row - data for a row of table (entry in the bundle)
   * @param column - column description
   */
  getCellStrings(row: Resource, column: ColumnDescription): string[] {
    const expression = column.expression || column.element.replace('[x]', '');
    const fullPath = expression ? this.resourceType + '.' + expression : '';

    for (const type of column.types) {
      const output = this.columnValuesService.valueToStrings(
        this.getEvaluator(fullPath)(row),
        type,
        column.isArray,
        fullPath
      );

      if (output && output.length) {
        return output;
      }
    }
    return [];
  }

  /**
   * Sort dataSource on table header click
   * @param sort - sorting event object containing info of table column and sort direction
   */
  sortData(sort: Sort): void {
    if (!sort.active || sort.direction === '') {
      return;
    }
    const isAsc = sort.direction === 'asc';
    const sortingColumnDescription = this.columnDescriptions.find(
      (c) => c.element === sort.active
    );
    this.dataSource.data.sort((a: Resource, b: Resource) => {
      const cellValueA = this.getCellStrings(a, sortingColumnDescription).join(
        '; '
      );
      const cellValueB = this.getCellStrings(b, sortingColumnDescription).join(
        '; '
      );
      return cellValueA.localeCompare(cellValueB) * (isAsc ? 1 : -1);
    });
    // Table will re-render only after data reference changed.
    this.dataSource.data = this.dataSource.data.slice();
  }

  /**
   * Creates Blob for download table
   */
  getBlob(): Blob {
    const columnDescriptions = this.columnDescriptions;
    const header = columnDescriptions
      .map((columnDescription) => columnDescription.displayName)
      .join(',');
    const rows = this.dataSource.data.map((resource) =>
      columnDescriptions
        .map((columnDescription) => {
          const cellText = this.getCellStrings(
            resource,
            columnDescription
          ).join('; ');
          if (/["\s,]/.test(cellText)) {
            // According to RFC-4180 which describes common format for CSV files:
            // Fields containing line breaks (CRLF), double quotes, and commas
            // should be enclosed in double-quotes.
            // If double-quotes are used to enclose fields, then a double-quote
            // appearing inside a field must be escaped by preceding it with
            // another double quote.
            // Also, according to https://en.wikipedia.org/wiki/Comma-separated_values:
            // In CSV implementations that do trim leading or trailing spaces,
            // fields with such spaces as meaningful data must be quoted.
            // Therefore, to avoid any problems, data with any spaces is also quoted.
            return '"' + cellText.replace(/"/, '""') + '"';
          } else {
            return cellText;
          }
        })
        .join(',')
    );

    return new Blob([[header].concat(rows).join('\n')], {
      type: 'text/plain;charset=utf-8',
      endings: 'native'
    });
  }

  /**
   * Checks if the table data is ready for download
   */
  isReadyForDownloadData(): boolean {
    return !this.isLoading && this.dataSource.data.length > 0;
  }

  /**
   * Select a list of items by ID in table.
   */
  setSelectedIds(ids: string[]): void {
    this.selectedResources.clear();
    const items = this.dataSource.data.filter((r) => ids.includes(r.id));
    this.selectedResources.select(...items);
  }

  /**
   * Open popup of filter criteria right below the table header of interest.
   * Filter input could be plain text or multi-select with a list of possible column values.
   * @param event - click event
   * @param column - column description of the header being clicked
   */
  openFilterDialog(event, column: ColumnDescription): void {
    event.stopPropagation();
    // The button that sits inside the table header with mat-sort-header attribute does not
    // fire the 'click' event properly. Have to listen to 'keydown' event here.
    if (!ResourceTableComponent.isA11yClick(event)) {
      return;
    }
    const rect = event.target.getBoundingClientRect();
    const dialogConfig = new MatDialogConfig();
    dialogConfig.hasBackdrop = true;

    // Position the popup right below the invoking icon.
    dialogConfig.position = { top: `${rect.bottom}px` };
    if (rect.left < window.innerWidth / 2) {
      dialogConfig.position.left = `${rect.left}px`;
    } else {
      dialogConfig.position.right = `${window.innerWidth - rect.right}px`;
    }

    const useAutocomplete = this.listFilterColumns.includes(column.element);
    let options: string[] = [];
    if (useAutocomplete) {
      const columnValues = this.dataSource.data.map((row) =>
        this.getCellStrings(row, column).join('; ')
      );
      options = [...new Set(columnValues)].filter((v) => v);
    }
    dialogConfig.data = {
      value: this.filtersForm.get(column.element).value,
      useAutocomplete,
      options
    };
    const dialogRef = this.dialog.open(
      ResourceTableFilterComponent,
      dialogConfig
    );
    dialogRef.afterClosed().subscribe((value) => {
      this.filtersForm.get(column.element).setValue(value);
    });
  }

  /**
   * Whether the column has filter criteria entered.
   */
  hasFilter(column: string): boolean {
    return (
      this.filtersForm.get(column).value &&
      this.filtersForm.get(column).value.length
    );
  }
}
