import type { Message } from '@bufbuild/protobuf';
import type { ScalarValue } from '@bufbuild/protobuf/reflect';
import type { Timestamp } from '@bufbuild/protobuf/wkt';

/**
 * Deep populate the message according to the options.
 *
 * NOTE: For `validTypes` to work, you should pass the valid message type (for example from `MessageValidType`).
 */
export type PopulatedMessage<
  T extends Message,
  O extends MessagePopulationOptions = MessagePopulationOptions,
> = T extends Timestamp
  ? O['jsDates'] extends true
    ? Date
    : PopulatedMessageInner<T, O>
  : PopulatedMessageInner<T, O>;

type PopulatedMessageInner<T extends Message, O extends MessagePopulationOptions> = {
  [K in keyof T as K extends '$typeName' | '$unknown'
    ? K
    : NonNullable<T[K]> extends MessageLike
      ? O['messages'] extends true
        ? never
        : K
      : O['scalars'] extends true
        ? never
        : K]: Field<0, NonNullable<T[K]>, O>;
} & {
  [K in keyof T as K extends '$typeName' | '$unknown'
    ? never
    : NonNullable<T[K]> extends MessageLike
      ? O['messages'] extends true
        ? K
        : never
      : O['scalars'] extends true
        ? K
        : never]-?: Field<0, NonNullable<T[K]>, O>;
};

/**
 * Permissive message input for `initMessage`.
 *
 * All properties, including nested, are optional.
 */
export type MessageInit<T extends Message> = T extends Timestamp
  ? Date | MessageInitInner<T>
  : MessageInitInner<T>;

type MessageInitInner<T extends Message> =
  | T
  | {
      [K in keyof T as K extends '$typeName' | '$unknown' ? never : K]?: Field<
        1,
        NonNullable<T[K]>
      >;
    };

/**
 * Strict message input for `initMessage`.
 *
 * All required properties, including nested, should be defined.
 */
export type StrictMessageInit<T extends Message> = T extends Timestamp
  ? Date | StrictMessageInitInner<T>
  : StrictMessageInitInner<T>;

type StrictMessageInitInner<T extends Message> =
  | T
  | ({
      [K in keyof T as K extends '$typeName' | '$unknown'
        ? never
        : T[K] extends Oneof
          ? never
          : K]: Field<2, NonNullable<T[K]>>;
    } & {
      // Oneofs should remain optional.
      [K in keyof T as T[K] extends Oneof ? K : never]?: Field<2, NonNullable<T[K]>>;
    });

/**
 * Deep remove the `$typeName` and `$unknown` properties from the message, and optionally convert `Timestamp` into JS `Date`.
 */
export type BareMessage<T extends Message, JsDates extends boolean = false> = JsDates extends true
  ? BareMessageInner<PopulatedMessage<T, { jsDates: true }>>
  : BareMessageInner<T>;

type BareMessageInner<T> = T extends Message
  ? {
      [K in keyof T as K extends '$typeName' | '$unknown' ? never : K]: Field<3, NonNullable<T[K]>>;
    }
  : T;

type MessageType<
  N extends 0 | 1 | 2 | 3,
  M extends Message,
  O extends MessagePopulationOptions,
> = N extends 0
  ? PopulatedMessage<M, O>
  : N extends 1
    ? MessageInit<M>
    : N extends 2
      ? StrictMessageInit<M>
      : BareMessage<M>;

type Field<
  N extends 0 | 1 | 2 | 3,
  T,
  O extends MessagePopulationOptions = MessagePopulationOptions,
> = T extends Message
  ? MessageType<N, T, O>
  : T extends Array<infer V>
    ? V extends Message
      ? MessageType<N, V, O>[]
      : T
    : T extends { case: infer K; value: infer V }
      ? V extends MessageLike
        ? { case: K; value: Field<N, V, O> }
        : T
      : T extends Record<infer K, infer V extends Message>
        ? Record<K, MessageType<N, V, O>>
        : T;

type Oneof =
  | { case: undefined; value?: undefined }
  | { case: string; value: Message | ScalarValue };

type MessageLike = Message | Message[] | Record<string | number, Message>;

export interface MessagePopulationOptions {
  /**
   * Populate all the required fields with defaults if they are missing (default `true`).
   *
   * This ensures runtime message types are the same as generated valid types (https://github.com/bufbuild/protobuf-es/blob/main/MANUAL.md#valid-types).
   */
  validTypes?: boolean;
  /**
   * Populate scalar fields with defaults (default `false`).
   */
  scalars?: boolean;
  /**
   * Populate message fields with defaults (default `false`).
   */
  messages?: boolean;
  /**
   * Convert `google.protobuf.Timestamp` into JS `Date` (default `false`).
   *
   * NOTE: Probably you want to use this in conjunction with `js_dates` option for `protoc-gen-nestjs` to generate proper types for client and controller.
   */
  jsDates?: boolean;
}
