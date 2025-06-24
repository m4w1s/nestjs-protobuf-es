import type { DescMessage, DescMethod, DescService } from '@bufbuild/protobuf';
import { type GeneratedFile, type Schema, createEcmaScriptPlugin } from '@bufbuild/protoplugin';
import { version } from '../package.json';

export const protocGenNestjs = createEcmaScriptPlugin({
  name: 'protoc-gen-nestjs',
  version: `v${version}`,
  parseOptions,
  generateTs,
});

interface Options {
  /** Use valid types instead of the default ones (https://github.com/bufbuild/protobuf-es/blob/main/MANUAL.md#valid-types). */
  validTypes: boolean;
  /**
   * Convert `google.protobuf.Timestamp` into JS `Date` in output types (input types already support both).
   *
   * NOTE: This should be used with `generateGrpcServices([], { jsDates: true })` to be in sync with the runtime.
   */
  jsDates: boolean;
  /** Use strict types for message init, where all the required parameters should be defined (by default, all are optional). */
  strictInit: boolean;
  /** Generate a `{name}.ts` file for every proto file, with exports from `{name}_pb.ts` and `{name}_nestjs.ts` for convenience. */
  exportFile: boolean;
}

function parseOptions(options: { key: string; value: string }[]): Options {
  const result: Options = {
    validTypes: false,
    jsDates: false,
    strictInit: false,
    exportFile: false,
  };

  for (const { key } of options) {
    if (key === 'valid_types') {
      result.validTypes = true;
    } else if (key === 'js_dates') {
      result.jsDates = true;
    } else if (key === 'strict_init') {
      result.strictInit = true;
    } else if (key === 'export_file') {
      result.exportFile = true;
    }
  }

  return result;
}

function generateTs(schema: Schema<Options>) {
  for (const file of schema.files) {
    const f = schema.generateFile(`${file.name}_nestjs.ts`);

    f.preamble(file);

    for (const service of file.services) {
      printService(f, service, schema.options);
    }

    if (schema.options.exportFile) {
      const exportFile = schema.generateFile(`${file.name}.ts`);
      // biome-ignore lint/style/noNonNullAssertion: `paths` has at least 1 element
      const importName = file.name.split('/').at(-1)!;

      exportFile.print`export * from "./${importName}_pb";`;

      if (file.services.length !== 0) {
        exportFile.print`export * from "./${importName}_nestjs";`;
      }
    }
  }
}

function printService(f: GeneratedFile, service: DescService, options: Options) {
  printServiceInterface(f, service, options, true);
  f.print();
  printServiceInterface(f, service, options, false);
  f.print();
  printServiceDecorator(f, service);
}

function printServiceInterface(
  f: GeneratedFile,
  service: DescService,
  options: Options,
  isClient: boolean,
) {
  f.print(f.jsDoc(service));
  f.print`export interface ${service.name}${isClient ? 'Client' : 'Controller'} {`;
  service.methods.forEach((method, index) => {
    if (index !== 0) {
      f.print();
    }

    printServiceMethod(f, method, options, isClient);
  });
  f.print`}`;
}

function printServiceMethod(
  f: GeneratedFile,
  method: DescMethod,
  options: Options,
  isClient: boolean,
) {
  const Observable = f.import('Observable', 'rxjs', true);
  const Metadata = f.import('Metadata', '@grpc/grpc-js', true);
  const PopulatedMessage = f.import('PopulatedMessage', 'nestjs-protobuf-es', true);
  const MessageInit = f.import(
    `${options.strictInit ? 'Strict' : ''}MessageInit`,
    'nestjs-protobuf-es',
    true,
  );
  const ReqType =
    options.validTypes && !isKnownType(method.input)
      ? f.importValid(method.input)
      : f.importShape(method.input);
  const ResType =
    options.validTypes && !isKnownType(method.output)
      ? f.importValid(method.output)
      : f.importShape(method.output);

  const isStreamReq =
    method.methodKind === 'client_streaming' || method.methodKind === 'bidi_streaming';
  const isStreamRes =
    method.methodKind === 'server_streaming' || method.methodKind === 'bidi_streaming';

  f.print(f.jsDoc(method, '  '));

  if (isClient) {
    const innerReq = [MessageInit, '<', ReqType, '>'];
    const req = isStreamReq ? [Observable, '<', ...innerReq, '>'] : innerReq;
    const innerRes =
      options.jsDates && canContainTimestamp(method.output)
        ? [PopulatedMessage, '<', ResType, ', { jsDates: true }>']
        : [ResType];
    const res = [Observable, '<', ...innerRes, '>'];

    f.print`  ${method.localName}(request${isEmpty(method.input) ? '?' : ''}: ${req}, metadata?: ${Metadata}): ${res};`;
  } else {
    const innerReq =
      options.jsDates && canContainTimestamp(method.input)
        ? [PopulatedMessage, '<', ReqType, ', { jsDates: true }>']
        : [ReqType];
    const req = isStreamReq ? [Observable, '<', ...innerReq, '>'] : innerReq;
    const innerRes = isEmpty(method.output) ? ['void'] : [MessageInit, '<', ResType, '>'];
    const res = isStreamRes
      ? [Observable, '<', ...innerRes, '>']
      : [...innerRes, ' | Promise<', ...innerRes, '>'];

    f.print`  ${method.localName}(request: ${req}, metadata: ${Metadata}, ...rest: unknown[]): ${res};`;
  }
}

function printServiceDecorator(f: GeneratedFile, service: DescService) {
  const GrpcMethod = f.import('GrpcMethod', '@nestjs/microservices');
  const GrpcStreamMethod = f.import('GrpcStreamMethod', '@nestjs/microservices');

  const methods = service.methods
    .map((method) => {
      const isStreamReq =
        method.methodKind === 'client_streaming' || method.methodKind === 'bidi_streaming';

      return `["${method.localName}", ${+isStreamReq}]`;
    })
    .join(', ');

  f.print`${f.export('function', `${service.name}Methods`)}() {`;
  f.print`  return function (constructor: Function) {`;
  f.print`    const methods: [string, number][] = [${methods}];`;
  f.print`    for (const [method, isStream] of methods) {`;
  f.print`      const descriptor = Reflect.getOwnPropertyDescriptor(constructor.prototype, method)!;`;
  f.print`      (isStream ? ${GrpcStreamMethod} : ${GrpcMethod})("${service.name}", method)(`;
  f.print`        constructor.prototype[method],`;
  f.print`        method,`;
  f.print`        descriptor,`;
  f.print`      );`;
  f.print`    }`;
  f.print`  };`;
  f.print`}`;
}

function canContainTimestamp(message: DescMessage): boolean {
  return !isKnownType(message) || message.typeName.slice(16) === 'Timestamp';
}

function isEmpty(message: DescMessage): boolean {
  return message.typeName === 'google.protobuf.Empty';
}

function isKnownType(message: DescMessage): boolean {
  return message.typeName.startsWith('google.protobuf.');
}
