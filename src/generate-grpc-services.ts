import {
  toBinary,
  fromBinary,
  type DescFile,
  type DescService,
  type DescMethod,
  type DescMessage,
} from '@bufbuild/protobuf';
import type { ServiceDefinition, MethodDefinition } from '@grpc/grpc-js';
import { initMessage } from './transformers';

/**
 * Generates grpc service definitions.
 */
export function generateGrpcServices(
  input: (DescFile | DescService) | (DescFile | DescService)[],
): Record<string, ServiceDefinition> {
  const results: Record<string, Record<string, MethodDefinition<unknown, unknown>>> = {};

  for (const type of Array.isArray(input) ? input : [input]) {
    for (const service of type.kind === 'service' ? [type] : type.services) {
      const serviceDefinition = (results[service.typeName] ??= {});

      for (const method of service.methods) {
        serviceDefinition[method.name] = createMethodDefinition(method);
      }
    }
  }

  return results;
}

function createMethodDefinition(method: DescMethod) {
  return {
    path: `/${method.parent.typeName}/${method.name}`,
    originalName: method.localName,
    requestStream:
      method.methodKind === 'client_streaming' || method.methodKind === 'bidi_streaming',
    responseStream:
      method.methodKind === 'server_streaming' || method.methodKind === 'bidi_streaming',
    requestSerialize: createSerializer(method.input),
    requestDeserialize: createDeserializer(method.input),
    responseSerialize: createSerializer(method.output),
    responseDeserialize: createDeserializer(method.output),
  };
}

function createSerializer(schema: DescMessage) {
  return (value: unknown): Buffer => {
    const message = initMessage(schema, value as Record<string, unknown>);

    return Buffer.from(toBinary(schema, message));
  };
}

function createDeserializer(schema: DescMessage) {
  return (bytes: Buffer) => {
    return fromBinary(schema, bytes);
  };
}
