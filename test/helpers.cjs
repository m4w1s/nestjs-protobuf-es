const { create, createFileRegistry } = require('@bufbuild/protobuf');
const {
  CodeGeneratorRequestSchema,
  FieldDescriptorProto_Label,
  FieldDescriptorProto_Type,
  FileDescriptorProtoSchema,
  file_google_protobuf_empty,
  file_google_protobuf_timestamp,
} = require('@bufbuild/protobuf/wkt');

const TEST_PROTO_NAME = 'test/service.proto';
const TEST_PACKAGE = 'test';

const LABEL = FieldDescriptorProto_Label;
const TYPE = FieldDescriptorProto_Type;

function scalarField(name, number, type = TYPE.STRING) {
  return {
    name,
    number,
    label: LABEL.OPTIONAL,
    type,
  };
}

function messageField(name, number, typeName, label = LABEL.OPTIONAL) {
  return {
    name,
    number,
    label,
    type: TYPE.MESSAGE,
    typeName,
  };
}

function createTestFileProto() {
  return create(FileDescriptorProtoSchema, {
    name: TEST_PROTO_NAME,
    package: TEST_PACKAGE,
    dependency: ['google/protobuf/empty.proto', 'google/protobuf/timestamp.proto'],
    syntax: 'proto3',
    messageType: [
      {
        name: 'Plain',
        field: [scalarField('name', 1)],
      },
      {
        name: 'DirectTime',
        field: [messageField('time', 1, '.google.protobuf.Timestamp')],
      },
      {
        name: 'NestedTime',
        field: [messageField('direct', 1, '.test.DirectTime')],
      },
      {
        name: 'RecursivePlain',
        field: [messageField('child', 1, '.test.RecursivePlain')],
      },
      {
        name: 'DateContainer',
        field: [
          messageField('time', 1, '.google.protobuf.Timestamp'),
          messageField('times', 2, '.google.protobuf.Timestamp', LABEL.REPEATED),
          messageField('time_map', 3, '.test.DateContainer.TimeMapEntry', LABEL.REPEATED),
          {
            ...messageField('selected_time', 4, '.google.protobuf.Timestamp'),
            oneofIndex: 0,
          },
          {
            ...scalarField('selected_label', 5),
            oneofIndex: 0,
          },
        ],
        nestedType: [
          {
            name: 'TimeMapEntry',
            field: [scalarField('key', 1), messageField('value', 2, '.google.protobuf.Timestamp')],
            options: { mapEntry: true },
          },
        ],
        oneofDecl: [{ name: 'choice' }],
      },
    ],
    service: [
      {
        name: 'TestService',
        method: [
          {
            name: 'UnaryPlain',
            inputType: '.test.Plain',
            outputType: '.test.Plain',
          },
          {
            name: 'UnaryTime',
            inputType: '.test.DateContainer',
            outputType: '.test.NestedTime',
          },
          {
            name: 'EmptyCall',
            inputType: '.google.protobuf.Empty',
            outputType: '.google.protobuf.Empty',
          },
          {
            name: 'ServerStreamTime',
            inputType: '.test.Plain',
            outputType: '.test.DateContainer',
            serverStreaming: true,
          },
          {
            name: 'ClientStreamTime',
            inputType: '.test.DateContainer',
            outputType: '.test.Plain',
            clientStreaming: true,
          },
          {
            name: 'BidiTime',
            inputType: '.test.DateContainer',
            outputType: '.test.DateContainer',
            clientStreaming: true,
            serverStreaming: true,
          },
          {
            name: 'RecursivePlain',
            inputType: '.test.RecursivePlain',
            outputType: '.test.RecursivePlain',
          },
        ],
      },
    ],
  });
}

function resolveFile(name) {
  if (name === 'google/protobuf/empty.proto') return file_google_protobuf_empty;
  if (name === 'google/protobuf/timestamp.proto') return file_google_protobuf_timestamp;
  return undefined;
}

function createTestRegistry() {
  return createFileRegistry(createTestFileProto(), resolveFile);
}

function getTestDescriptors() {
  const registry = createTestRegistry();
  const file = registry.getFile(TEST_PROTO_NAME);

  if (!file) {
    throw new Error(`Missing test descriptor ${TEST_PROTO_NAME}`);
  }

  return {
    file,
    service: registry.getService('test.TestService'),
    plain: registry.getMessage('test.Plain'),
    directTime: registry.getMessage('test.DirectTime'),
    nestedTime: registry.getMessage('test.NestedTime'),
    recursivePlain: registry.getMessage('test.RecursivePlain'),
    dateContainer: registry.getMessage('test.DateContainer'),
  };
}

function createCodeGeneratorRequest(parameter = 'target=ts') {
  return create(CodeGeneratorRequestSchema, {
    fileToGenerate: [TEST_PROTO_NAME],
    parameter,
    protoFile: [
      file_google_protobuf_empty.proto,
      file_google_protobuf_timestamp.proto,
      createTestFileProto(),
    ],
  });
}

function filesByName(response) {
  return new Map(response.file.map((file) => [file.name, file.content]));
}

module.exports = {
  TEST_PROTO_NAME,
  createCodeGeneratorRequest,
  createTestFileProto,
  filesByName,
  getTestDescriptors,
};
