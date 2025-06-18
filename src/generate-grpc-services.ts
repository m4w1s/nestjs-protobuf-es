import {
  type DescFile,
  type DescMessage,
  type DescMethod,
  type DescService,
  fromBinary,
  toBinary,
} from '@bufbuild/protobuf';
import type { MethodDefinition, ServiceDefinition } from '@grpc/grpc-js';
import { initMessage, populateInPlace } from './transformers';
import type { MessagePopulationOptions } from './types';

/**
 * Generates grpc service definitions.
 */
export function generateGrpcServices(
  input: (DescFile | DescService) | (DescFile | DescService)[],
  options?: MessagePopulationOptions,
): Record<string, ServiceDefinition> {
  const results: Record<string, Record<string, MethodDefinition<unknown, unknown>>> = {};

  for (const type of Array.isArray(input) ? input : [input]) {
    for (const service of type.kind === 'service' ? [type] : type.services) {
      const serviceDefinition = (results[service.typeName] ??= {});

      for (const method of service.methods) {
        serviceDefinition[method.name] = createMethodDefinition(method, options);
      }
    }
  }

  return results;
}

function createMethodDefinition(method: DescMethod, options?: MessagePopulationOptions) {
  return {
    path: `/${method.parent.typeName}/${method.name}`,
    originalName: method.localName,
    requestStream:
      method.methodKind === 'client_streaming' || method.methodKind === 'bidi_streaming',
    responseStream:
      method.methodKind === 'server_streaming' || method.methodKind === 'bidi_streaming',
    requestSerialize: createSerializer(method.input),
    requestDeserialize: createDeserializer(method.input, options),
    responseSerialize: createSerializer(method.output),
    responseDeserialize: createDeserializer(method.output, options),
  };
}

function createSerializer(schema: DescMessage) {
  return (value: unknown): Buffer => {
    const message = initMessage(schema, value as Record<string, unknown>);

    return Buffer.from(toBinary(schema, message));
  };
}

function createDeserializer(schema: DescMessage, options?: MessagePopulationOptions) {
  return (bytes: Buffer) => {
    return populateInPlace(schema, fromBinary(schema, bytes), options);
  };
}
