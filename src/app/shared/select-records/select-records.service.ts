import { Injectable } from '@angular/core';
import Resource = fhir.Resource;
import { from, Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import Bundle = fhir.Bundle;
import { catchError, map, startWith, switchMap } from 'rxjs/operators';
import { getNextPageUrl } from '../utils';
import { Sort } from '@angular/material/sort';
import { CartService } from '../cart/cart.service';
import { HttpOptions } from '../../types/http-options';
import {
  CACHE_INFO,
  CACHE_NAME,
  FhirBackendService
} from '../fhir-backend/fhir-backend.service';

interface SelectRecordState {
  // Indicates that data is loading
  loading: boolean;
  // Array of loaded resources
  resources: Resource[];
  // Whether result is cached
  isCached?: Observable<boolean>;
  // Time when the data was received from the server
  loadTime?: Date;
  // Next page URL for regular FHIR resources
  nextBundleUrl?: string;
  // Page number for CTSS variables
  currentPage?: number;
  // Indicates whether we need to reload data
  reset?: boolean;
  // The total number of records is used to determine whether the next page
  // of CTSS variables exists
  totalRecords?: number;
}

@Injectable({
  providedIn: 'root'
})
export class SelectRecordsService {
  constructor(
    private http: HttpClient,
    private cart: CartService,
    private fhirBackend: FhirBackendService
  ) {}

  currentState: { [resourceType: string]: SelectRecordState } = {};
  resourceStream: { [resourceType: string]: Observable<Resource[]> } = {};

  /**
   * Resets the state of all resource types.
   */
  resetAll(): void {
    this.currentState = {};
    this.resourceStream = {};
    this.cart.reset();
  }

  /**
   * Resets the state for the specified resource type
   * @param resourceType - resource type
   */
  resetState(resourceType: string): void {
    if (this.currentState[resourceType]) {
      // The easiest way is to delete the state, but in this case, the table
      // component will be recreated, which will lead to the image flickering.
      this.currentState[resourceType].reset = true;
    }
  }

  /**
   * Returns true if resource type records need to be reloaded.
   * @param resourceType - resource type
   */
  isNeedToReload(resourceType: string): boolean {
    return (
      !this.currentState[resourceType] || this.currentState[resourceType].reset
    );
  }

  /**
   * Loads the first page of resources of specified resource type.
   * @param resourceType - resource type
   * @param url - request URL.
   * @param options - the HTTP options to send with the request.
   */
  loadFirstPage(resourceType: string, url: string, options: HttpOptions): void {
    this.currentState[resourceType] = {
      loading: true,
      resources: [],
      nextBundleUrl: url
    };

    this.loadNextPage(resourceType, options);
  }

  /**
   * Loads the next page of resources of specified resource type.
   * @param resourceType - resource type
   * @param options - the HTTP options to send with the request.
   */
  loadNextPage(resourceType, options?: HttpOptions): void {
    const currentState = this.currentState[resourceType];
    if (!currentState.nextBundleUrl) {
      return;
    }
    const url = currentState.nextBundleUrl;
    delete currentState.nextBundleUrl;

    currentState.loading = true;
    currentState.isCached = from(
      this.fhirBackend.isCached(url, options.context?.get(CACHE_NAME))
    );
    this.resourceStream[resourceType] = this.http.get(url, options).pipe(
      map((data: Bundle) => {
        const cacheInfo = options.context.get(CACHE_INFO);
        currentState.loadTime = cacheInfo
          ? new Date(cacheInfo.timestamp)
          : new Date();

        currentState.resources = currentState.resources.concat(
          data.entry?.map((item) => item.resource) || []
        );
        currentState.nextBundleUrl = getNextPageUrl(data);
        currentState.loading = false;
        return currentState.resources;
      }),
      catchError((error) => {
        currentState.nextBundleUrl = url;
        throw error;
      }),
      switchMap((resources: Resource[]) =>
        // Exclude records added to the cart from the list
        this.cart.getCartChanged(resourceType).pipe(
          startWith(resources),
          map(() =>
            resources.filter(
              (resource) => !this.cart.hasRecord(resourceType, resource)
            )
          )
        )
      ),
      startWith([])
    );
  }

  /**
   * Loads variables for selected research studies.
   * @param selectedResearchStudies - array of selected research studies.
   * @param params - http parameters
   * @param filters - filter values
   * @param sort - the current sort state
   * @param pageNumber - page number to load
   */
  loadVariables(
    selectedResearchStudies: Resource[],
    params: {
      [param: string]: any;
    },
    filters: any,
    sort: Sort,
    pageNumber: number
  ): void {
    const resourceType = 'Variable';
    let currentState;
    if (pageNumber === 0) {
      currentState = {
        loading: true,
        resources: [],
        currentPage: pageNumber,
        totalRecords: 0
      };
      this.currentState[resourceType] = currentState;
    } else {
      currentState = this.currentState[resourceType];
      if (
        currentState?.loading ||
        currentState?.totalRecords <= pageNumber * 50
      ) {
        return;
      }
      currentState.loading = true;
    }

    const dataFields = {
      id: 'uid',
      display_name: 'display_name',
      loinc_long_name: 'loinc.LONG_COMMON_NAME',
      loinc_short_name: 'loinc.SHORTNAME',
      loinc_num: 'loinc_num',
      study_id: 'study_id',
      study_name: 'study_name',
      dataset_id: 'dataset_id',
      dataset_name: 'dataset_name',
      class: 'loinc.CLASS',
      type: 'dbgv.type',
      unit: 'dbgv.unit'
    };

    const url = `https://clinicaltables.nlm.nih.gov/api/dbg_vars/v3/search`;

    const studyIds = selectedResearchStudies.map((r) => r.id + '*');

    const query = [];
    if (studyIds.length) {
      query.push('study_id:(' + studyIds.join(' OR ') + ')');
    }
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        if (key === 'display_name') {
          // Name for display is currently the LOINC short name or dbGap description.
          // To find synonyms, we extended the display name search by additionally
          // searching the long and short LOINC names.
          query.push(`(${dataFields[key]}:(${value}) OR synonyms:(${value}))`);
        } else {
          query.push(`${dataFields[key]}:(${value})`);
        }
      }
    });

    const uniqDataFields = [...new Set(Object.values(dataFields))];

    this.resourceStream[resourceType] = this.http
      .get(url, {
        params: {
          offset: pageNumber * 50,
          count: 50,
          df: uniqDataFields.join(','),
          terms: '',
          q: query.join(' AND '),
          ...params,
          ...(sort
            ? {
                of:
                  dataFields[sort.active] +
                  ':' +
                  // MatTable shows sort order icons in reverse (see comment to PR on LF-1905).
                  (sort.direction === 'asc' ? 'desc' : 'asc')
              }
            : {})
        }
      })
      .pipe(
        map((data: any) => {
          const total = data[0];
          currentState.totalRecords = total;
          const list = data[3];
          if (total && list) {
            list.forEach((item) => {
              const res = {
                resourceType
              };
              const values = {};
              Object.keys(dataFields).forEach((key, index) => {
                values[uniqDataFields[index]] = item[index];
              });
              Object.entries(dataFields).forEach(([key, field]) => {
                res[key] = values[field];
              });
              currentState.resources.push(res);
            });
          }
          currentState.loading = false;
          currentState.currentPage = pageNumber;
          return currentState.resources;
        }),
        catchError((error) => {
          currentState.loading = false;
          throw error;
        }),
        switchMap((resources: Resource[]) =>
          this.cart.getCartChanged(resourceType).pipe(
            startWith(resources),
            map(() =>
              resources.filter(
                (resource) => !this.cart.hasRecord(resourceType, resource)
              )
            )
          )
        )
      );
  }

  // Loading is complete and there is data in the table
  getHasLoadedData(resourceType: string): boolean {
    return (
      !this.currentState[resourceType]?.loading &&
      this.currentState[resourceType]?.resources.length > 0
    );
  }
}
