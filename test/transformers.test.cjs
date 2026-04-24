const assert = require('node:assert/strict');
const test = require('node:test');

const { create, toBinary } = require('@bufbuild/protobuf');
const {
  DescriptorProtoSchema,
  FileDescriptorProtoSchema,
  UninterpretedOption_NamePartSchema,
} = require('@bufbuild/protobuf/wkt');
const { populate } = require('../dist/transformers');

test('populate fills legacy required scalar fields for valid types', () => {
  const message = create(UninterpretedOption_NamePartSchema);
  const populated = populate(UninterpretedOption_NamePartSchema, message);

  assert.equal(Object.hasOwn(populated, 'namePart'), true);
  assert.equal(Object.hasOwn(populated, 'isExtension'), true);
  assert.equal(populated.namePart, '');
  assert.equal(populated.isExtension, false);
  assert.doesNotThrow(() => toBinary(UninterpretedOption_NamePartSchema, populated));
});

test('populate recursively fills nested scalar fields when scalars is enabled', () => {
  const message = create(FileDescriptorProtoSchema, { options: {} });
  const populated = populate(FileDescriptorProtoSchema, message, {
    scalars: true,
    validTypes: false,
  });

  assert.ok(populated.options);
  assert.equal(Object.hasOwn(populated.options, 'javaPackage'), true);
  assert.equal(populated.options.javaPackage, '');
});

test('populate recursively fills scalar fields in repeated messages when scalars is enabled', () => {
  const message = create(DescriptorProtoSchema, { field: [{}] });
  const populated = populate(DescriptorProtoSchema, message, {
    scalars: true,
    validTypes: false,
  });

  assert.equal(populated.field.length, 1);
  assert.equal(Object.hasOwn(populated.field[0], 'name'), true);
  assert.equal(populated.field[0].name, '');
});
