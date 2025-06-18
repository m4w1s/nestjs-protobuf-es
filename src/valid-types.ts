import { type DescField, ScalarType } from '@bufbuild/protobuf';
import { BinaryReader } from '@bufbuild/protobuf/wire';
import { FeatureSet_FieldPresence } from '@bufbuild/protobuf/wkt';

const PV_EXT_NUMBER = 1159;
const PV_FIELD_RULES_MAP = new Map([
  [25, { name: 'required', type: ScalarType.BOOL }],
  [27, { name: 'ignore', type: ScalarType.INT32 }],
] as const);
const PV_MESSAGE_RULES_MAP = new Map([[1, { name: 'disabled', type: ScalarType.BOOL }]] as const);

const IS_FIELD_REQUIRED_CACHE = new WeakMap<DescField, boolean>();

/**
 * Returns true if the field is required by protovalidate or has the proto2 `required` label, or the Edition
 * feature field_presence = LEGACY_REQUIRED.
 *
 * Results for each field are cached for performance reasons.
 */
export function isFieldRequired(field: DescField): boolean {
  let required = IS_FIELD_REQUIRED_CACHE.get(field);

  if (required == null) {
    required = isProtoValidateRequired(field) || isLegacyRequired(field);

    IS_FIELD_REQUIRED_CACHE.set(field, required);
  }

  return required;
}

/**
 * Returns true if the field is required by protovalidate.
 *
 * Note that this function only applies to message fields (singular, repeated, map),
 * and always returns false for other field types.
 */
function isProtoValidateRequired(field: DescField): boolean {
  if (!field.proto.options?.$unknown) {
    return false;
  }

  let fieldRules: { required?: boolean; ignore?: number } = {};

  for (const uf of field.proto.options.$unknown) {
    if (uf.no !== PV_EXT_NUMBER) continue;

    fieldRules = { ...extractFields(uf.data, PV_FIELD_RULES_MAP) };
  }

  if (!fieldRules.required || fieldRules.ignore === 3) {
    return false;
  }

  if (field.parent.proto.options?.$unknown) {
    let messageRules: { disabled?: boolean } = {};

    for (const uf of field.parent.proto.options.$unknown) {
      if (uf.no !== PV_EXT_NUMBER) continue;

      messageRules = { ...extractFields(uf.data, PV_MESSAGE_RULES_MAP) };
    }

    if (messageRules.disabled) {
      return false;
    }
  }

  return true;
}

/**
 * Returns true if the field has the proto2 `required` label, or the Edition
 * feature field_presence = LEGACY_REQUIRED.
 *
 * Note that this function only applies to singular message fields, and always
 * returns false for other fields.
 */
function isLegacyRequired(field: DescField): boolean {
  return (
    field.fieldKind === 'message' && field.presence === FeatureSet_FieldPresence.LEGACY_REQUIRED
  );
}

function extractFields<T extends Record<string, unknown>>(
  bytes: Uint8Array,
  fieldMap: ReadonlyMap<number, { name: string; type: ScalarType.INT32 | ScalarType.BOOL }>,
): T {
  const reader = new BinaryReader(bytes);
  const end = reader.pos + reader.uint32();
  const results: Record<string, unknown> = {};
  let resultSize = 0;

  while (reader.pos < end) {
    const [fieldNo, wireType] = reader.tag();
    const fieldDesc = fieldMap.get(fieldNo);

    if (!fieldDesc) {
      reader.skip(wireType);
      continue;
    }

    results[fieldDesc.name] = readValue(reader, fieldDesc.type);

    // Check if all fields were extracted and leave early.
    if (++resultSize === fieldMap.size) break;
  }

  return results as T;
}

function readValue(reader: BinaryReader, type: ScalarType.INT32 | ScalarType.BOOL) {
  switch (type) {
    case ScalarType.INT32:
      return reader.int32();
    case ScalarType.BOOL:
      return reader.bool();
    default:
      throw new Error(`Unknown scalar type: ${type}`);
  }
}
