/**
 * This file contains a service used to handle HTTP requests to the FHIR server.
 */
import { Injectable, Injector } from '@angular/core';
import {
  HttpBackend,
  HttpContextToken,
  HttpErrorResponse,
  HttpEvent,
  HttpRequest,
  HttpResponse,
  HttpXhrBackend
} from '@angular/common/http';
import { BehaviorSubject, Observable, Observer } from 'rxjs';
import { FhirBatchQuery, HTTP_ABORT } from './fhir-batch-query';
import definitionsIndex from '../definitions/index.json';
import { FhirServerFeatures } from '../../types/fhir-server-features';
import { escapeStringForRegExp, getUrlParam, setUrlParam } from '../utils';
import { SettingsService } from '../settings-service/settings.service';
import { find } from 'lodash-es';
import { filter, map } from 'rxjs/operators';
import { FhirService } from '../fhir-service/fhir.service';
import { Router } from '@angular/router';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { RasTokenService } from '../ras-token/ras-token.service';

// RegExp to modify the URL of requests to the FHIR server.
// If the URL starts with the substring "$fhir", it will be replaced
// with the current URL of the FHIR REST API database.
const serviceBaseUrlRegExp = /^\$fhir/;

export enum ConnectionStatus {
  Pending = 0,
  Ready,
  Error,
  Disconnect
}

// Token to store cacheName in the context of an HTTP request.
// See https://angular.io/api/common/http/HttpContext
export const CACHE_NAME = new HttpContextToken<string>(() => '');

// Token to store cache info in the context of an HTTP request.
// See https://angular.io/api/common/http/HttpContext
export const CACHE_INFO = new HttpContextToken<{
  timestamp: number;
  expirationTime: number;
}>(() => null);

// A list of resources in dbGap that must have _security params passed along when querying.
const RESOURCES_REQUIRING_AUTHORIZATION = 'Observation|ResearchSubject';

/**
 * This is a final HttpHandler which will dispatch the request via browser HTTP APIs
 * to a backend. Interceptors sit between the HttpClient interface and the
 * HttpBackend. When injected, HttpBackend dispatches requests directly to
 * the backend, without going through the interceptor chain.
 * The main function which handles HTTP requests is called "handle".
 */
@Injectable({
  providedIn: 'root'
})
export class FhirBackendService implements HttpBackend {
  // FHIR REST API Service Base URL (https://www.hl7.org/fhir/http.html#root)
  set serviceBaseUrl(url: string) {
    const dbgapRasLoginServer = sessionStorage.getItem('dbgapRasLoginServer');
    const isRasLogoutNeeded =
      dbgapRasLoginServer && url !== dbgapRasLoginServer;

    if (this.serviceBaseUrl !== url) {
      this.initialized.next(ConnectionStatus.Disconnect);
      this.initialized.next(ConnectionStatus.Pending);
      this.smartConnectionSuccess = false;
      this.fhirService.setSmartConnection(null);
      this._isSmartOnFhir = false;
      // Logging out of RAS when changing server
      (isRasLogoutNeeded
        ? // Access to RasTokenService via injector to avoid circular dependency
          this.injector.get(RasTokenService).logout()
        : Promise.resolve()
      ).then(() => {
        this.initializeFhirBatchQuery(url);
      });
    } else if (isRasLogoutNeeded) {
      // Logging out of RAS when changing the "server" URL parameter
      this.injector
        // Access to RasTokenService via injector to avoid circular dependency
        .get(RasTokenService)
        .logout()
        .then(() => {
          this.initializeFhirBatchQuery(url);
        });
    }
  }
  get serviceBaseUrl(): string {
    return this.fhirClient.getServiceBaseUrl();
  }

  // Checkbox value of whether to use a SMART on FHIR client.
  // tslint:disable-next-line:variable-name
  private _isSmartOnFhir = false;
  set isSmartOnFhir(value: boolean) {
    if (value) {
      this.initialized.next(ConnectionStatus.Pending);
      this._isSmartOnFhir = true;
      // Navigate to 'launch' page to authorize a SMART on FHIR connection.
      this.router.navigate(
        [
          '/launch',
          {
            iss: this.serviceBaseUrl,
            redirectUri: setUrlParam(
              'isSmart',
              true,
              window.location.pathname + window.location.search
            )
          }
        ],
        {
          skipLocationChange: true
        }
      );
    } else {
      this.smartConnectionSuccess = false;
      this.fhirService.setSmartConnection(null);
      this._isSmartOnFhir = false;
      this.initialized.next(ConnectionStatus.Disconnect);
      this.initialized.next(ConnectionStatus.Pending);
      this.initializeFhirBatchQuery(this.serviceBaseUrl);
    }
  }
  get isSmartOnFhir(): boolean {
    return this._isSmartOnFhir;
  }

  // Maximum number of requests that can be combined
  set maxRequestsPerBatch(value: number) {
    this.fhirClient.setMaxRequestsPerBatch(value);
  }
  get maxRequestsPerBatch(): number {
    return this.fhirClient.getMaxRequestsPerBatch();
  }

  // Maximum number of requests that can be executed simultaneously
  set maxActiveRequests(val: number) {
    this.fhirClient.setMaxActiveRequests(val);
  }
  get maxActiveRequests(): number {
    return this.fhirClient.getMaxActiveRequests();
  }

  // NCBI E-utilities API Key.
  // See https://ncbiinsights.ncbi.nlm.nih.gov/2017/11/02/new-api-keys-for-the-e-utilities/
  set apiKey(val: string) {
    this.fhirClient.setApiKey(val);
  }

  set cacheEnabled(value: boolean) {
    this.isCacheEnabled = value;
    if (!value) {
      FhirBatchQuery.clearCache();
    }
  }
  get cacheEnabled(): boolean {
    return this.isCacheEnabled;
  }

  // An object describing the server features
  get features(): FhirServerFeatures {
    return this.fhirClient.getFeatures();
  }

  // Version name e.g. "R4"
  get currentVersion(): string {
    return this.fhirClient.getVersionName();
  }

  /**
   * Creates and initializes an instance of FhirBackendService
   * @param defaultBackend - default Angular final HttpHandler which uses
   *   XMLHttpRequest to send requests to a backend server.
   * @param fhirService a service which holds the SMART on FHIR connection client
   * @param router Angular router
   * @param injector an Angular injector, which is responsible for creating
   *   service instances and injecting them into classes
   * @param liveAnnouncer a service is used to announce messages for screen-reader
   *   users using an aria-live region.
   */
  constructor(
    private defaultBackend: HttpXhrBackend,
    private fhirService: FhirService,
    private router: Router,
    private injector: Injector,
    private liveAnnouncer: LiveAnnouncer
  ) {
    this._isSmartOnFhir = getUrlParam('isSmart') === 'true';
    const queryServer = getUrlParam('server');
    const defaultServer = 'https://lforms-fhir.nlm.nih.gov/baseR4';
    this.fhirClient = new FhirBatchQuery({
      serviceBaseUrl: queryServer || defaultServer
    });
    this.currentDefinitions$ = this.initialized.pipe(
      filter((status) => status === ConnectionStatus.Ready),
      map(() => this.getCurrentDefinitions())
    );
  }
  // Whether the connection to server is initialized.
  initialized = new BehaviorSubject(ConnectionStatus.Pending);
  currentDefinitions$: Observable<any>;

  // Whether to cache requests to the FHIR server
  private isCacheEnabled = true;

  // Whether to show a checkbox of SMART on FHIR connection.
  public isSmartOnFhirEnabled = false;
  // Whether a SMART on FHIR connection has been successfully established.
  public smartConnectionSuccess = false;

  // Javascript client from the old version of Research Data Finder
  // for FHIR with the ability to automatically combine requests in a batch .
  fhirClient: FhirBatchQuery;

  // Can't be injected in constructor because of circular dependency
  settings: SettingsService;

  // Definitions of columns, search params, value sets for current FHIR version
  private currentDefinitions: any;

  // Stores connection status set in initializeFhirBatchQuery(), instead of
  // emitting it right away to this.initialized subject. It will be emitted
  // after checkSmartOnFhirEnabled() is done, or values will be emitted from
  // initializeSmartOnFhirConnection() instead if SMART on FHIR should connect.
  private tmpConnectionStatus: ConnectionStatus;

  // Whether an authorization tag should be added to the url.
  private isAuthorizationRequiredForUrl(url: string): boolean {
    const regEx = new RegExp(`/(${RESOURCES_REQUIRING_AUTHORIZATION})`);
    return this.isDbgap(url) && regEx.test(url);
  }

  /**
   * Checks whether SMART on FHIR connection is available for current base url.
   * Initializes the SMART connection if it's available and this.isSmartOnFhir is
   * already marked as true.
   * @param url - FHIR REST API Service Base URL.
   */
  checkSmartOnFhirEnabled(url: string): Promise<boolean> {
    return this.fhirClient
      .getWithCache(`${url}/.well-known/smart-configuration`, {
        combine: false,
        cacheErrors: true,
        retryCount: 2
      })
      .then(() => {
        this.isSmartOnFhirEnabled = true;
        return true;
      })
      .catch(() => {
        this.isSmartOnFhirEnabled = false;
        return false;
      })
      .finally(() => {
        // Set up SMART connection when it redirects back with a SMART-valid server and "isSmart=true".
        if (this.isSmartOnFhirEnabled && this.isSmartOnFhir) {
          this.initializeSmartOnFhirConnection();
        } else if (this.tmpConnectionStatus) {
          // Otherwise, if it's invoked from initializeFhirBatchQuery(), emit the connection status.
          this.initialized.next(this.tmpConnectionStatus);
          this.tmpConnectionStatus = null;
        }
      });
  }

  /**
   * Establish a SMART on FHIR connection.
   */
  initializeSmartOnFhirConnection(): void {
    if (
      !this.fhirService.getSmartConnection() &&
      !this.fhirService.smartConnectionInProgress()
    ) {
      this.fhirService.requestSmartConnection((success) => {
        if (success) {
          this.smartConnectionSuccess = true;
          this.liveAnnouncer.announce('SMART on FHIR connection succeeded.');
          // Load definitions of search parameters and columns from CSV file
          this.settings.loadCsvDefinitions().subscribe(
            (resourceDefinitions) => {
              this.currentDefinitions = { resources: resourceDefinitions };
              this.fhirClient.setMaxRequestsPerBatch(
                this.settings.get('maxRequestsPerBatch')
              );
              this.fhirClient.setMaxActiveRequests(
                this.settings.get('maxActiveRequests')
              );
              this.initialized.next(ConnectionStatus.Ready);
            },
            (err) => {
              if (!(err instanceof HttpErrorResponse)) {
                // Show exceptions from loadCsvDefinitions in console
                console.error(err.message);
              }
              this.initialized.next(ConnectionStatus.Error);
            }
          );
        } else {
          this.smartConnectionSuccess = false;
          this.initialized.next(ConnectionStatus.Error);
          this.liveAnnouncer.announce('SMART on FHIR connection failed.');
        }
      });
    }
  }

  /**
   * Initialize/reinitialize FhirBatchQuery instance
   * @param [serviceBaseUrl] - new FHIR REST API Service Base URL
   */
  initializeFhirBatchQuery(serviceBaseUrl: string = ''): void {
    // Set _isDbgap flag in fhirClient
    this.fhirClient.setIsDbgap(
      this.isDbgap(serviceBaseUrl || this.serviceBaseUrl)
    );
    // Cleanup definitions before initialize
    this.currentDefinitions = null;
    this.fhirClient.initialize(serviceBaseUrl).then(
      () => {
        // Load definitions of search parameters and columns from CSV file
        this.settings.loadCsvDefinitions().subscribe(
          (resourceDefinitions) => {
            this.currentDefinitions = { resources: resourceDefinitions };
            this.fhirClient.setMaxRequestsPerBatch(
              this.settings.get('maxRequestsPerBatch')
            );
            this.fhirClient.setMaxActiveRequests(
              this.settings.get('maxActiveRequests')
            );
            this.tmpConnectionStatus = ConnectionStatus.Ready;
            this.checkSmartOnFhirEnabled(this.serviceBaseUrl);
          },
          (err) => {
            if (!(err instanceof HttpErrorResponse)) {
              // Show exceptions from loadCsvDefinitions in console
              console.error(err.message);
            }
            this.tmpConnectionStatus = ConnectionStatus.Error;
            this.checkSmartOnFhirEnabled(this.serviceBaseUrl);
          }
        );
      },
      (err) => {
        if (err.status !== HTTP_ABORT) {
          this.tmpConnectionStatus = ConnectionStatus.Error;
          this.checkSmartOnFhirEnabled(this.serviceBaseUrl);
        }
      }
    );
  }

  /**
   * Prepares the request URL by replacing "$fhir" with serviceBaseURL and
   * adding additional required parameters.
   * @param url - request URL
   */
  prepareRequestUrl(url: string): string {
    const newUrl = url.replace(serviceBaseUrlRegExp, this.serviceBaseUrl);
    // Until authentication is in place for dbGaP, we need to include the
    // consent groups as values for _security.
    // Observation and ResearchSubject queries will be sent with _security params.
    return this.features.consentGroup &&
      this.isAuthorizationRequiredForUrl(newUrl)
      ? this.fhirClient.addParamToUrl(
          newUrl,
          '_security',
          this.features.consentGroup
        )
      : newUrl;
  }

  /**
   * Whether cached response data exists for the URL and has not expired.
   * @param url - URL
   * @param cacheName - cache name for persistent data storage
   *   between sessions, if not specified, gets response data from the temporary
   *   cache that will disappear when the page is reloaded.
   */
  isCached(url: string, cacheName: string): Promise<boolean> {
    return this.fhirClient.isCached(
      this.prepareRequestUrl(url),
      cacheName ? cacheName + '-' + this.serviceBaseUrl : ''
    );
  }

  /**
   * Clears persistent cache data by cache name.
   * @param cacheName - cache name for persistent data storage between
   *   sessions.
   */
  clearCacheByName(cacheName: string): Promise<void> {
    return this.fhirClient.clearCacheByName(
      cacheName + '-' + this.serviceBaseUrl
    );
  }

  /**
   * Handles HTTP requests.
   * All requests which matched to serviceBaseUrlRegExp treated as requests
   * to the current FHIR server. GET requests to the FHIR server could be
   * combined into a batch. FhirBatchQuery from the old version of
   * Research Data Finder is used for that.
   */
  handle(request: HttpRequest<any>): Observable<HttpEvent<any>> {
    if (
      !serviceBaseUrlRegExp.test(request.url) &&
      !request.url.startsWith(this.serviceBaseUrl)
    ) {
      // If it is not a request to the FHIR server,
      // pass the request to the default Angular backend.
      return this.defaultBackend.handle(request);
    }

    if (this.smartConnectionSuccess) {
      // Use the FHIR client in fhirService for queries.
      const newUrl = request.url.replace(serviceBaseUrlRegExp, '');
      return new Observable<HttpResponse<any>>(
        (observer: Observer<HttpResponse<any>>) => {
          this.fhirService
            .getSmartConnection()
            .request(newUrl)
            .then(
              (res) => {
                observer.next(
                  new HttpResponse<any>({
                    body: res
                  })
                );
                observer.complete();
              },
              (res) =>
                observer.error(
                  new HttpErrorResponse({
                    error: res.error
                  })
                )
            );
        }
      );
    } else {
      // not a SMART on FHIR connection
      const serviceBaseUrlWithEndpoint = new RegExp(
        '^' + escapeStringForRegExp(this.serviceBaseUrl) + '\\/[^?]+'
      );
      const cacheName = request.context.get(CACHE_NAME);
      const newRequest = request.clone({
        url: this.prepareRequestUrl(request.url)
      });

      if (request.method !== 'GET') {
        // If it is not a GET request to the FHIR server,
        // pass the request to the default Angular backend.
        return this.defaultBackend.handle(newRequest);
      }

      const fullUrl = newRequest.urlWithParams;

      // Otherwise, use the FhirBatchQuery from the old version of
      // Research Data Finder to handle the HTTP request.
      return new Observable<HttpResponse<any>>(
        (observer: Observer<HttpResponse<any>>) => {
          this.fhirClient.initialize().then(() => {
            // Requests to the FHIR server without endpoint cannot be combined
            // into a batch request
            const combine =
              this.fhirClient.getFeatures().batch &&
              serviceBaseUrlWithEndpoint.test(newRequest.url);
            const promise = this.isCacheEnabled
              ? this.fhirClient.getWithCache(fullUrl, {
                  combine,
                  cacheName: cacheName
                    ? cacheName + '-' + this.serviceBaseUrl
                    : ''
                })
              : this.fhirClient.get(fullUrl, { combine });

            promise.then(
              ({ status, data, _cacheInfo_ }) => {
                request.context.set(CACHE_INFO, _cacheInfo_);
                observer.next(
                  new HttpResponse<any>({
                    status,
                    body: data,
                    url: fullUrl
                  })
                );
                observer.complete();
              },
              // In case of failure due to expired TST token sent to dbGaP, we should
              // probably log out and user can log back in.
              // According to Eric, dbGaP query will return a 400. Hopefully it should
              // come with some error message indicating the expired TST token so we can
              // distinguish this case with others, but we'll have to wait until it's
              // implemented in dbGaP.
              ({ status, error }) =>
                observer.error(
                  new HttpErrorResponse({
                    status,
                    error,
                    url: fullUrl
                  })
                )
            );
          });
        }
      );
    }
  }

  /**
   * Disconnect from server (run on destroying the main component)
   */
  disconnect(): void {
    this.initialized.next(ConnectionStatus.Disconnect);
  }

  /**
   * Returns definitions of columns, search params, value sets for current FHIR version
   */
  getCurrentDefinitions(): any {
    // Prepare CSV definitions only on first call
    if (this.currentDefinitions?.initialized) {
      return this.currentDefinitions;
    }

    const versionName = this.currentVersion || 'R4';
    const definitions = definitionsIndex.configByVersionName[versionName];

    // Initialize common definitions
    if (!definitions.initialized) {
      // Add default common column "id"
      Object.keys(definitions.resources).forEach((resourceType) => {
        definitions.resources[resourceType].columnDescriptions.unshift({
          types: ['string'],
          element: 'id',
          isArray: false
        });
      });

      // Normalize spec definitions
      Object.keys(definitions.resources).forEach((resourceType) => {
        definitions.resources[resourceType].searchParameters.forEach(
          (param) => {
            param.element = param.displayName = param.name;
            delete param.name;
          }
        );
      });

      // Prepare spec definitions only on first call
      const valueSets = definitions.valueSets;
      const valueSetMaps = (definitions.valueSetMaps = Object.keys(
        valueSets
      ).reduce((valueSetsMap, entityName) => {
        valueSetsMap[entityName] =
          typeof valueSets[entityName] === 'string'
            ? valueSets[entityName]
            : valueSets[entityName].reduce((entityMap, item) => {
                entityMap[item.code] = item.display;
                return entityMap;
              }, {});
        return valueSetsMap;
      }, {}));

      Object.keys(definitions.valueSetByPath).forEach((path) => {
        definitions.valueSetMapByPath[path] =
          valueSetMaps[definitions.valueSetByPath[path]];
        definitions.valueSetByPath[path] =
          valueSets[definitions.valueSetByPath[path]];
      });
      definitions.initialized = true;
    }

    // Merge definitions(from spec) with currentDefinitions(from CSV)
    // TODO: Modify the webpack loader to exclude unnecessary data retrieving
    //       from the specification
    this.currentDefinitions = {
      ...definitions,
      resources: this.currentDefinitions.resources
    };

    Object.keys(this.currentDefinitions.resources).forEach((resourceType) => {
      const currentParameters = this.currentDefinitions.resources[resourceType]
        .searchParameters;
      const specParameters =
        definitions.resources[resourceType]?.searchParameters;
      if (specParameters) {
        currentParameters.forEach((parameter) => {
          const specParameter = find(specParameters, {
            element: parameter.element
          });
          if (specParameter) {
            Object.assign(parameter, {
              rootPropertyName: specParameter.rootPropertyName,
              expression: specParameter.expression,
              // path: specParameter.path,
              valueSet: specParameter.valueSet,
              required: specParameter.required
            });
          }
        });
      }
    });

    // Add interpretation search parameter if applicable.
    if (this.features.interpretation) {
      const observationSearchParams = this.currentDefinitions.resources
        .Observation?.searchParameters;
      if (
        observationSearchParams &&
        !observationSearchParams.some((sp) => sp.element === 'interpretation')
      ) {
        observationSearchParams.push({
          element: 'interpretation',
          displayName: 'interpretation',
          description:
            'A categorical assessment, providing a rough qualitative interpretation of the observation value',
          type: 'CodeableConcept',
          isArray: false
        });
        observationSearchParams.sort((a, b) =>
          a.element.localeCompare(b.element)
        );
      }
    }

    this.currentDefinitions.initialized = true;
    return this.currentDefinitions;
  }

  /**
   * Whether the URL is dbGap (https://dbgap-api.ncbi.nlm.nih.gov/fhir*).
   */
  isDbgap(url): boolean {
    const urlPattern = this.settings.getDbgapUrlPattern();
    return new RegExp(urlPattern).test(url);
  }

  /**
   * Clears cache data.
   */
  clearCache(): void {
    FhirBatchQuery.clearCache();
  }
}
