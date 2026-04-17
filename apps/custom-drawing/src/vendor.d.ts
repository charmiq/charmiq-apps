// type stubs for modules resolved via importMap at runtime
declare module 'rxjs' {
  export interface Observable<T> {
    subscribe(observer: any): any;
    pipe(...ops: any[]): Observable<any>;
  }
  export class Subject<T> implements Observable<T> {
    subscribe(observer: any): any;
    pipe(...ops: any[]): Observable<any>;
    next(value?: T): void;
    complete(): void;
  }
  export function of<T>(...args: T[]): Observable<T>;
  export function race<T>(...observables: Observable<T>[]): Observable<T>;
  export function timer(dueTime: number, period?: number): Observable<number>;
}

declare module 'rxjs/operators' {
  export function map<T, R>(project: (value: T) => R): any;
  export function distinctUntilChanged<T>(compare?: (prev: T, curr: T) => boolean): any;
  export function catchError<T>(selector: (err: any) => any): any;
  export function debounceTime(ms: number): any;
  export function take(count: number): any;
}
