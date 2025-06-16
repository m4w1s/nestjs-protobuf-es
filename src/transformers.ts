import type { DescMessage, DescField, MessageShape, MessageInitShape } from '@bufbuild/protobuf';
import { create, clone, isMessage } from '@bufbuild/protobuf';
import {
  reflect,
  scalarZeroValue,
  isReflectMessage,
  type ReflectMessage,
} from '@bufbuild/protobuf/reflect';
import { timestampFromDate, timestampDate, type Timestamp } from '@bufbuild/protobuf/wkt';
import type { MessageInit, PopulatedMessage, MessagePopulationOptions } from './types';

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
    for (const field of member.kind === 'field' ? [member] : member.fields) {
      const obj = field.oneof ? target[field.oneof.localName] : target;
      const value = obj?.[field.localName];

      if (value === undefined) continue;

      if (field.fieldKind === 'message') {
        obj[field.localName] = initMessage(field.message, value);
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
  }

  return create(schema, target as MessageInitShape<Desc>);
}

/**
 * Create a deep copy of the message and let you populate its fields with defaults, or convert `Timestamp` fields to JS dates.
 */
export function populate<Desc extends DescMessage, Options extends MessagePopulationOptions>(
  schema: Desc,
  message: MessageShape<Desc>,
  options?: Options,
): PopulatedMessage<MessageShape<Desc>, Options> {
  return populateInPlace(schema, clone(schema, message), options);
}

function populateInPlace<Desc extends DescMessage, Options extends MessagePopulationOptions>(
  schema: Desc,
  message: MessageShape<Desc> | ReflectMessage,
  options?: Options,
): PopulatedMessage<MessageShape<Desc>, Options> {
  const r = isReflectMessage(message) ? message : reflect(schema, message, false);

  if (schema.typeName === 'google.protobuf.Timestamp') {
    if (options?.jsDate) {
      return timestampDate(r.message as Timestamp) as PopulatedMessage<MessageShape<Desc>, Options>;
    }

    // Timestamp already has every field populated.
    return r.message as unknown as PopulatedMessage<MessageShape<Desc>, Options>;
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
      if (options?.message || (options?.jsDate && r.isSet(field))) {
        r.set(field, populateInPlace(field.message, r.get(field), options));
      }
    } else {
      // biome-ignore lint/suspicious/noExplicitAny: `any` is the best choice for dynamic access
      const target = r.message as Record<string, any>;
      const value: unknown = field.oneof
        ? target[field.oneof.localName].value
        : target[field.localName];

      if (field.fieldKind === 'scalar') {
        if (options?.scalar && value === undefined) {
          r.set(field, scalarZeroValue(field.scalar, field.longAsString));
        }
      } else if (field.fieldKind === 'enum') {
        if (options?.scalar && value === undefined) {
          r.set(field, field.enum.values[0].number);
        }
      } else if (
        (field.fieldKind === 'map' && field.mapKind === 'message') ||
        (field.fieldKind === 'list' && field.listKind === 'message')
      ) {
        if (options?.message || options?.jsDate) {
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

  return r.message as unknown as PopulatedMessage<MessageShape<Desc>, Options>;
}
