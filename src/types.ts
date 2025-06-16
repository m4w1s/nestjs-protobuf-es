import type { Message } from '@bufbuild/protobuf';
import type { Timestamp } from '@bufbuild/protobuf/wkt';

export type MessageInit<T extends Message> = T extends Timestamp
  ? Date | MessageInitInner<T>
  : MessageInitInner<T>;

type MessageInitInner<T extends Message> =
  | T
  | {
      [K in keyof T as K extends '$typeName' | '$unknown' ? never : K]?: FieldInit<
        NonNullable<T[K]>
      >;
    };

type FieldInit<T> = T extends Message
  ? MessageInit<T>
  : T extends Array<infer V>
    ? V extends Message
      ? MessageInit<V>[]
      : T
    : T extends { case: infer K; value: infer V }
      ? V extends MessageLike
        ? { case: K; value: FieldInit<V> }
        : T
      : T extends Record<infer K, infer V extends Message>
        ? Record<K, MessageInit<V>>
        : T;

export type PopulatedMessage<
  T extends Message,
  O extends MessagePopulationOptions = MessagePopulationOptions,
> = T extends Timestamp
  ? O['jsDate'] extends true
    ? Date
    : PopulatedMessageInner<T, O>
  : PopulatedMessageInner<T, O>;

type PopulatedMessageInner<T extends Message, O extends MessagePopulationOptions> = {
  [K in keyof T as K extends '$typeName' | '$unknown'
    ? K
    : NonNullable<T[K]> extends MessageLike
      ? O['message'] extends true
        ? never
        : K
      : O['scalar'] extends true
        ? never
        : K]: PopulatedField<NonNullable<T[K]>, O>;
} & {
  [K in keyof T as K extends '$typeName' | '$unknown'
    ? never
    : NonNullable<T[K]> extends MessageLike
      ? O['message'] extends true
        ? K
        : never
      : O['scalar'] extends true
        ? K
        : never]-?: PopulatedField<NonNullable<T[K]>, O>;
};

type PopulatedField<T, O extends MessagePopulationOptions> = T extends Message
  ? PopulatedMessage<T, O>
  : T extends Array<infer V>
    ? V extends Message
      ? PopulatedMessage<V, O>[]
      : T
    : T extends { case: infer K; value: infer V }
      ? V extends MessageLike
        ? { case: K; value: PopulatedField<V, O> }
        : T
      : T extends Record<infer K, infer V extends Message>
        ? Record<K, PopulatedMessage<V, O>>
        : T;

type MessageLike = Message | Message[] | Record<string | number, Message>;

export interface MessagePopulationOptions {
  /** Populate scalar fields with defaults. */
  scalar?: boolean;
  /** Populate message fields with defaults. */
  message?: boolean;
  /** Convert google.protobuf.Timestamp to JS dates. */
  jsDate?: boolean;
}
