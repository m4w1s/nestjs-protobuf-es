import type {
  DescField,
  DescMessage,
  MessageInitShape,
  MessageShape,
  MessageValidType,
} from '@bufbuild/protobuf';
import { clone, create, isMessage } from '@bufbuild/protobuf';
import {
  type ReflectMessage,
  isReflectMessage,
  reflect,
  scalarZeroValue,
} from '@bufbuild/protobuf/reflect';
import { type Timestamp, timestampDate, timestampFromDate } from '@bufbuild/protobuf/wkt';
import type { MessageInit, MessagePopulationOptions, PopulatedMessage } from './types';
import { isFieldRequired } from './valid-types';

/**
 * Create a new message instance.
 *
 * This is similar to `create` from `@bufbuild/protobuf`, with the difference that it handles JS dates and converts them to `Timestamp`.
 */
export function initMessage<Desc extends DescMessage>(
  schema: Desc,
  init?: MessageInit<MessageShape<Desc>>,
): MessageShape<Desc> {
  if (isMessage(init, schema)) {
    return init;
  }
  if (init == null) {
    return create(schema);
  }

  if (schema.typeName === 'google.protobuf.Timestamp') {
    if (init instanceof Date) {
      return timestampFromDate(init) as unknown as MessageShape<Desc>;
    }

    return create(schema, init as MessageInitShape<Desc>);
  }

  // biome-ignore lint/suspicious/noExplicitAny: `any` is the best choice for dynamic access
  const target = init as Record<string, any>;

  for (const member of schema.members) {
    let field: DescField | undefined;
    // biome-ignore lint/suspicious/noExplicitAny: `any` is the best choice for dynamic access
    let value: any;

    if (member.kind === 'field') {
      field = member;
      value = target[field.localName];
    } else {
      const caseName = target[member.localName]?.case;

      if (caseName === undefined) continue;

      field = member.fields.find((f) => f.localName === caseName);
      value = target[member.localName].value;

      if (!field) continue;
    }

    if (value === undefined) continue;

    if (field.fieldKind === 'message') {
      const msg = initMessage(field.message, value);

      if (field.oneof) {
        target[field.oneof.localName].value = msg;
      } else {
        target[field.localName] = msg;
      }
    } else if (field.fieldKind === 'map') {
      if (field.mapKind !== 'message' || typeof value !== 'object' || value === null) continue;

      for (const key of Object.keys(value)) {
        value[key] = initMessage(field.message, value[key]);
      }
    } else if (field.fieldKind === 'list') {
      if (field.listKind !== 'message' || !Array.isArray(value) || value.length === 0) continue;

      for (let i = 0; i < value.length; i++) {
        value[i] = initMessage(field.message, value[i]);
      }
    }
  }

  return create(schema, target as MessageInitShape<Desc>);
}

/**
 * Create a deep copy of the message and populate it and/or convert `Timestamp` fields into JS `Date`.
 *
 * This method may be slow because of the cloning.
 * If you don't worry about modifying the original message, you can use `populateInPlace` instead.
 */
export function populate<Desc extends DescMessage, Options extends MessagePopulationOptions>(
  schema: Desc,
  message: MessageShape<Desc>,
  options?: Options,
): PopulatedMessage<
  Options['validTypes'] extends false ? MessageShape<Desc> : MessageValidType<Desc>,
  Options
> {
  return populateInPlace(schema, clone(schema, message), options);
}

/**
 * Deep populate the message and/or convert `Timestamp` fields into JS `Date`.
 *
 * This method is more performant, but mutates the original message.
 */
export function populateInPlace<Desc extends DescMessage, Options extends MessagePopulationOptions>(
  schema: Desc,
  message: MessageShape<Desc> | ReflectMessage,
  options?: Options,
): PopulatedMessage<
  Options['validTypes'] extends false ? MessageShape<Desc> : MessageValidType<Desc>,
  Options
> {
  const r = isReflectMessage(message) ? message : reflect(schema, message, false);

  if (schema.typeName === 'google.protobuf.Timestamp') {
    if (options?.jsDates) {
      return timestampDate(r.message as Timestamp) as never;
    }

    // Timestamp already has every field populated.
    return r.message as never;
  }

  for (const member of r.members) {
    let field: DescField;

    if (member.kind === 'field') {
      field = member;
    } else {
      const oneofField = r.oneofCase(member);

      if (!oneofField) continue;

      field = oneofField;
    }

    if (field.fieldKind === 'message') {
      if (
        options?.messages ||
        (options?.jsDates && r.isSet(field)) ||
        (options?.validTypes !== false && isFieldRequired(field))
      ) {
        r.set(field, populateInPlace(field.message, r.get(field), options));
      }
    } else {
      // biome-ignore lint/suspicious/noExplicitAny: `any` is the best choice for dynamic access
      const target = r.message as Record<string, any>;
      const value: unknown = field.oneof
        ? target[field.oneof.localName].value
        : target[field.localName];

      if (field.fieldKind === 'scalar') {
        if (value === undefined && options?.scalars) {
          r.set(field, scalarZeroValue(field.scalar, field.longAsString));
        }
      } else if (field.fieldKind === 'enum') {
        if (value === undefined && options?.scalars) {
          r.set(field, field.enum.values[0].number);
        }
      } else if (
        (field.fieldKind === 'map' && field.mapKind === 'message') ||
        (field.fieldKind === 'list' && field.listKind === 'message')
      ) {
        if (options?.validTypes !== false || options.messages || options.jsDates) {
          const mapOrList = r.get(field);

          for (const entry of mapOrList.entries()) {
            const msg = populateInPlace(
              field.message,
              entry[1] as MessageShape<typeof field.message>,
              options,
            );

            mapOrList.set(entry[0] as number, msg);
          }
        }
      }
    }
  }

  return r.message as never;
}
