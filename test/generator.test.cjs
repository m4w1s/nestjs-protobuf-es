const assert = require('node:assert/strict');
const test = require('node:test');

const { protocGenNestjs } = require('../dist/protoc-gen-nestjs-plugin');
const { createCodeGeneratorRequest, filesByName } = require('./helpers.cjs');

function runGenerator(parameter = 'target=ts') {
  const response = protocGenNestjs.run(createCodeGeneratorRequest(parameter));

  assert.equal(response.error ?? '', '');

  return filesByName(response);
}

function findFile(files, suffix) {
  for (const [name, content] of files) {
    if (name.endsWith(suffix)) return content;
  }

  throw new Error(`Generated file ending with ${suffix} was not found`);
}

function findLine(content, pattern) {
  const line = content.split('\n').find((candidate) => candidate.includes(pattern));

  if (!line) {
    throw new Error(`Generated line containing ${pattern} was not found`);
  }

  return line;
}

test('generator emits service interfaces', () => {
  const files = runGenerator();
  const content = findFile(files, '_nestjs.ts');

  assert.match(content, /export interface TestServiceClient/);
  assert.match(content, /export interface TestServiceController/);
});

test('generator emits expected unary and streaming method types', () => {
  const files = runGenerator();
  const content = findFile(files, '_nestjs.ts');

  assert.match(findLine(content, 'unaryPlain'), /MessageInit<Plain>/);
  assert.match(findLine(content, 'unaryPlain'), /Observable<Plain>/);
  assert.match(findLine(content, 'emptyCall'), /request\?: MessageInit<Empty>/);
  assert.match(findLine(content, 'serverStreamTime'), /Observable<DateContainer>/);
  assert.match(findLine(content, 'clientStreamTime'), /Observable<MessageInit<DateContainer>>/);
  assert.match(findLine(content, 'bidiTime'), /Observable<MessageInit<DateContainer>>/);
});

test('js_dates generation only wraps messages that can contain Timestamp', () => {
  const files = runGenerator('target=ts,js_dates');
  const content = findFile(files, '_nestjs.ts');
  const plainLine = findLine(content, 'unaryPlain');
  const recursiveLine = findLine(content, 'recursivePlain');
  const timeClientLine = findLine(content, 'unaryTime');
  const serverStreamLine = findLine(content, 'serverStreamTime');

  assert.doesNotMatch(plainLine, /PopulatedMessage/);
  assert.doesNotMatch(recursiveLine, /PopulatedMessage/);
  assert.match(timeClientLine, /PopulatedMessage<NestedTime, \{ jsDates: true \}>/);
  assert.match(serverStreamLine, /PopulatedMessage<DateContainer, \{ jsDates: true \}>/);
});

test('false-valued plugin options are disabled', () => {
  const files = runGenerator(
    'target=ts,js_dates=false,valid_types=false,strict_init=false,export_file=false',
  );
  const content = findFile(files, '_nestjs.ts');

  assert.equal(
    [...files.keys()].some((name) => name.endsWith('/service.ts')),
    false,
  );
  assert.doesNotMatch(content, /StrictMessageInit/);
  assert.doesNotMatch(findLine(content, 'unaryTime'), /PopulatedMessage/);
});

test('strict_init and export_file options affect generated output', () => {
  const files = runGenerator('target=ts,strict_init,export_file');
  const nestjsContent = findFile(files, '_nestjs.ts');
  const exportContent = findFile(files, 'service.ts');

  assert.match(nestjsContent, /StrictMessageInit/);
  assert.match(exportContent, /export \* from "\.\/service_pb";/);
  assert.match(exportContent, /export \* from "\.\/service_nestjs";/);
});
