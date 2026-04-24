import { type DescField, ScalarType, type UnknownField } from '@bufbuild/protobuf';
import { BinaryReader, WireType } from '@bufbuild/protobuf/wire';
import { FeatureSet_FieldPresence } from '@bufbuild/protobuf/wkt';

const PV_EXT_NUMBER = 1159;
const PV_FIELD_RULES_MAP = new Map([
  [25, { name: 'required', type: ScalarType.BOOL }],
  [27, { name: 'ignore', type: ScalarType.INT32 }],
] as const);
const PV_MESSAGE_RULES_MAP = new Map([[1, { name: 'disabled', type: ScalarType.BOOL }]] as const);

const IS_FIELD_REQUIRED_CACHE = new WeakMap<DescField, boolean>();

/**
 * Returns true if the field is required by protovalidate, has the proto2 `required` label, or the Edition
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
 * Note that the protovalidate `required` rule is commonly used for fields with explicit presence.
 */
function isProtoValidateRequired(field: DescField): boolean {
  const fieldRules = extractExtensionFields<{ required?: boolean; ignore?: number }>(
    field.proto.options?.$unknown,
    PV_FIELD_RULES_MAP,
  );

  if (!fieldRules.required || fieldRules.ignore === 3) {
    return false;
  }

  const messageRules = extractExtensionFields<{ disabled?: boolean }>(
    field.parent.proto.options?.$unknown,
    PV_MESSAGE_RULES_MAP,
  );

  if (messageRules.disabled) {
    return false;
  }

  return true;
}

/**
 * Returns true if the field has the proto2 `required` label, or the Edition
 * feature field_presence = LEGACY_REQUIRED.
 */
function isLegacyRequired(field: DescField): boolean {
  return field.presence === FeatureSet_FieldPresence.LEGACY_REQUIRED;
}

function extractExtensionFields<T extends Record<string, unknown>>(
  unknownFields: readonly UnknownField[] | undefined,
  fieldMap: ReadonlyMap<number, { name: string; type: ScalarType.INT32 | ScalarType.BOOL }>,
): T {
  const results: Record<string, unknown> = {};

  for (const uf of unknownFields ?? []) {
    if (uf.no !== PV_EXT_NUMBER || uf.wireType !== WireType.LengthDelimited) continue;

    Object.assign(results, extractFields(uf.data, fieldMap));
  }

  return results as T;
}

function extractFields<T extends Record<string, unknown>>(
  bytes: Uint8Array,
  fieldMap: ReadonlyMap<number, { name: string; type: ScalarType.INT32 | ScalarType.BOOL }>,
): T {
  const reader = new BinaryReader(bytes);
  const end = reader.pos + reader.uint32();
  const results: Record<string, unknown> = {};

  while (reader.pos < end) {
    const [fieldNo, wireType] = reader.tag();
    const fieldDesc = fieldMap.get(fieldNo);

    if (!fieldDesc) {
      reader.skip(wireType);
      continue;
    }

    if (wireType !== WireType.Varint) {
      reader.skip(wireType);
      continue;
    }

    results[fieldDesc.name] = readValue(reader, fieldDesc.type);
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
