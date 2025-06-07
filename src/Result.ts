export type Ok<T> = { tag: 'Ok', value: T }
export type Err<E> = { tag: 'Err', error: E }
export type Result<T, E> = Ok<T> | Err<E>
