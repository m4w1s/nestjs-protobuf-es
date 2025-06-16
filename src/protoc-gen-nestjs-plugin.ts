import { createEcmaScriptPlugin, type Schema, type GeneratedFile } from '@bufbuild/protoplugin';
import type { DescService, DescMethod, DescMessage } from '@bufbuild/protobuf';
import { version } from '../package.json';

export const protocGenNestjs = createEcmaScriptPlugin({
  name: 'protoc-gen-nestjs',
  version: `v${version}`,
  parseOptions,
  generateTs,
});

interface Options {
  validTypes: boolean;
}

function parseOptions(options: { key: string; value: string }[]): Options {
  const result: Options = {
    validTypes: false,
  };

  for (const { key } of options) {
    if (key === 'valid_types') {
      result.validTypes = true;
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
  const MessageInit = f.import('MessageInit', 'nestjs-protobuf-es', true);
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
    const res = isStreamRes ? [Observable, '<', ResType, '>'] : ['Promise<', ResType, '>'];

    f.print`  ${method.localName}(request${isEmpty(method.input) ? '?' : ''}: ${req}, metadata?: ${Metadata}): ${res};`;
  } else {
    const req = isStreamReq ? [Observable, '<', ReqType, '>'] : [ReqType];
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

      return `["${method.localName}", ${isStreamReq}]`;
    })
    .join(', ');

  f.print`${f.export('function', `${service.name}Methods`)}() {`;
  f.print`  return function (constructor: Function) {`;
  f.print`    const methods: [string, boolean][] = [${methods}];`;
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

function isEmpty(message: DescMessage): boolean {
  return message.typeName === 'google.protobuf.Empty';
}

function isKnownType(message: DescMessage): boolean {
  return message.typeName.startsWith('google.') || message.typeName.startsWith('buf.');
}
