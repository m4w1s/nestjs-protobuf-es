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

```
npm install nestjs-protobuf-es @bufbuild/protobuf @grpc/grpc-js
npm install --save-dev @bufbuild/buf @bufbuild/protoc-gen-es

# Or with yarn
yarn add nestjs-protobuf-es @bufbuild/protobuf @grpc/grpc-js
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

To generate the code, simply run:
```
npx buf generate
```

## Usage

For example, we have the following definition:

```proto
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
import { generateGrpcServices } from 'nestjs-protobuf-es';
import { file_eliza, ElizaService } from './gen/eliza_pb';

const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.GRPC,
  options: {
    package: ['eliza'],
    packageDefinition: generateGrpcServices([
      file_eliza, // You can load the whole proto file
      ElizaService, // Or just required services
    ]),
  },
});
```

And implement the controller like this:

```ts
import { ElizaServiceMethods, ElizaServiceController } from './gen/eliza_nestjs';
import { SayRequest } from './gen/eliza_pb';

@Controller()
@ElizaServiceMethods()
export class ElizaController implements ElizaServiceController {
  async say(request: SayRequest) {
    return {
      sentence: request.sentence,
      time: new Date(), // The conversion to `Timestmap` will be handled by the plugin.
    };
  }
}
```

### Additional utilities

#### `populate(schema: DescMessage, message: Message, options?: Options)`

**Returns: `PopulatedMessage<Message>`**

Populate message fields with defaults and/or convert `Timestamp` to JS `Date`.\
Method handles all the nested messages, maps, lists and oneofs.

```ts
interface Options {
  /** Populate scalar fields with defaults. */
  scalar?: boolean;
  /** Populate message fields with defaults. */
  message?: boolean;
  /** Convert google.protobuf.Timestamp to JS dates. */
  jsDate?: boolean;
}
```
