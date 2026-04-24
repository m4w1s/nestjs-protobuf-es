# nestjs-protobuf-es

[![npm](https://img.shields.io/npm/v/nestjs-protobuf-es)](https://www.npmjs.com/package/nestjs-protobuf-es)
[![license](https://img.shields.io/npm/l/nestjs-protobuf-es)](https://github.com/m4w1s/nestjs-protobuf-es/blob/main/LICENSE)

[@bufbuild/protobuf](https://github.com/bufbuild/protobuf-es) integration for [NestJS](https://docs.nestjs.com/microservices/grpc)

## Features

- Generates interfaces for both client and controller.
- Generates decorators that unifies `@GrpcMethod` and `@GrpcStreamMethod`.
- Handles serialization of JS `Date` into `google.protobuf.Timestamp`.
- Provides a method to convert `google.protobuf.Timestamp` to JS `Date` in messages (including nested messages, maps, lists and oneofs).
- Properly typed.

## Installation

```sh
npm install nestjs-protobuf-es @bufbuild/protobuf @grpc/grpc-js @nestjs/microservices rxjs
npm install --save-dev @bufbuild/buf @bufbuild/protoc-gen-es

# Or with yarn
yarn add nestjs-protobuf-es @bufbuild/protobuf @grpc/grpc-js @nestjs/microservices rxjs
yarn add -D @bufbuild/buf @bufbuild/protoc-gen-es
```

## Configuration

Add a new configuration file to the root of your project `buf.gen.yaml`:

```yaml
version: v2
inputs:
  - directory: proto
plugins:
  - local: protoc-gen-es
    opt: target=ts
    out: src/gen
  - local: protoc-gen-nestjs
    opt: target=ts
    out: src/gen
```

Available `protoc-gen-nestjs` options:

- `valid_types` - use generated protobuf-es valid types in generated NestJS interfaces.
- `js_dates` - type `google.protobuf.Timestamp` fields as JS `Date` for controller requests and client responses. Use with `generateGrpcServices(..., { jsDates: true })`.
- `strict_init` - use `StrictMessageInit` for controller responses and client requests.
- `export_file` - generate a `{name}.ts` barrel file that exports `{name}_pb.ts` and `{name}_nestjs.ts`.

Boolean options are enabled when present. Use `false` or `0` to disable an option explicitly, for example `js_dates=false`.

To generate the code, simply run:
```sh
npx buf generate
```

## Usage

For example, we have the following definition:

```proto
syntax = "proto3";

package eliza;

import "google/protobuf/timestamp.proto";

service ElizaService {
  rpc Say(SayRequest) returns (SayResponse) {}
}

message SayRequest {
  string sentence = 1;
}
message SayResponse {
  string sentence = 1;

  google.protobuf.Timestamp time = 2;
}
```

`ElizaServiceClient`, `ElizaServiceController` and `ElizaServiceMethods` will be generated.

You can then configure the grpc service:

```ts
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { generateGrpcServices } from 'nestjs-protobuf-es';
import { file_eliza, ElizaService } from './gen/eliza_pb';

const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.GRPC,
  options: {
    package: ['eliza'],
    packageDefinition: generateGrpcServices(file_eliza),
    // Or load only selected services:
    // packageDefinition: generateGrpcServices(ElizaService),
  },
});
```

And implement the controller like this:

```ts
import { Controller } from '@nestjs/common';
import { ElizaServiceMethods, ElizaServiceController } from './gen/eliza_nestjs';
import { SayRequest } from './gen/eliza_pb';

@Controller()
@ElizaServiceMethods()
export class ElizaController implements ElizaServiceController {
  async say(request: SayRequest) {
    return {
      sentence: request.sentence,
      time: new Date(), // The runtime serializer converts Date to Timestamp.
    };
  }
}
```

### Additional utilities

#### `generateGrpcServices(input: DescFile | DescService | (DescFile | DescService)[], options?: Options)`

**Returns: `Record<string, ServiceDefinition>`**

Builds `@grpc/grpc-js` package definitions from protobuf-es file or service descriptors.\
The same `Options` interface below is used for deserializing incoming messages. If generated interfaces use `js_dates`, pass `{ jsDates: true }` here too.

```ts
packageDefinition: generateGrpcServices(file_eliza, { jsDates: true });
```

#### `initMessage(schema: DescMessage, init?: MessageInit<Message>)`

**Returns: `Message`**

Creates a protobuf-es message and converts JS `Date` values to `google.protobuf.Timestamp`, including nested messages, maps, lists and oneofs.

This method normalizes nested message values in place before passing them to protobuf-es `create()`.

#### `populate(schema: DescMessage, message: Message, options?: Options)`

**Returns: `PopulatedMessage<Message>`**

Creates a deep copy of the message and populates message fields with defaults and/or converts `Timestamp` to JS `Date`.\
Method handles all the nested messages, maps, lists and oneofs.

#### `populateInPlace(schema: DescMessage, message: Message, options?: Options)`

**Returns: `PopulatedMessage<Message>`**

Like `populate()`, but mutates the original message.

```ts
interface Options {
  /**
   * Populate all the required fields with defaults if they are missing (default `true`).
   *
   * This ensures runtime message types are the same as generated valid types (https://github.com/bufbuild/protobuf-es/blob/main/MANUAL.md#valid-types).
   */
  validTypes?: boolean;
  /**
   * Populate scalar fields with defaults (default `false`).
   */
  scalars?: boolean;
  /**
   * Populate message fields with defaults (default `false`).
   */
  messages?: boolean;
  /**
   * Convert `google.protobuf.Timestamp` into JS `Date` (default `false`).
   *
   * NOTE: Probably you want to use this in conjunction with `js_dates` option for `protoc-gen-nestjs` to generate proper types for client and controller.
   */
  jsDates?: boolean;
}
```
