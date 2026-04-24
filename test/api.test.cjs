const assert = require('node:assert/strict');
const test = require('node:test');

const { create } = require('@bufbuild/protobuf');
const { timestampDate, timestampFromDate, TimestampSchema } = require('@bufbuild/protobuf/wkt');
const { generateGrpcServices, initMessage, populate, populateInPlace } = require('../dist');
const { getTestDescriptors } = require('./helpers.cjs');

const descriptors = getTestDescriptors();
const date = new Date('2026-04-24T12:34:56.789Z');

function assertTimestamp(value, expected = date) {
  assert.equal(value?.$typeName, 'google.protobuf.Timestamp');
  assert.equal(timestampDate(value).getTime(), expected.getTime());
}

test('public entrypoint exports runtime APIs', () => {
  assert.equal(typeof generateGrpcServices, 'function');
  assert.equal(typeof initMessage, 'function');
  assert.equal(typeof populate, 'function');
  assert.equal(typeof populateInPlace, 'function');
});

test('initMessage creates defaults and returns matching message instances unchanged', () => {
  const empty = initMessage(descriptors.dateContainer);
  assert.equal(empty.$typeName, 'test.DateContainer');

  const existing = create(descriptors.dateContainer, {});
  assert.equal(initMessage(descriptors.dateContainer, existing), existing);
});

test('initMessage converts Date values to Timestamp in nested inputs', () => {
  const message = initMessage(descriptors.dateContainer, {
    time: date,
    times: [date],
    timeMap: { created: date },
    choice: { case: 'selectedTime', value: date },
  });

  assertTimestamp(message.time);
  assertTimestamp(message.times[0]);
  assertTimestamp(message.timeMap.created);
  assert.equal(message.choice.case, 'selectedTime');
  assertTimestamp(message.choice.value);
});

test('initMessage converts a root Date to Timestamp', () => {
  assertTimestamp(initMessage(TimestampSchema, date));
});

test('populate converts Timestamp fields to Date on a clone', () => {
  const message = initMessage(descriptors.dateContainer, {
    time: date,
    times: [date],
    timeMap: { created: date },
    choice: { case: 'selectedTime', value: date },
  });
  const populated = populate(descriptors.dateContainer, message, { jsDates: true });

  assert.equal(populated.time.getTime(), date.getTime());
  assert.equal(populated.times[0].getTime(), date.getTime());
  assert.equal(populated.timeMap.created.getTime(), date.getTime());
  assert.equal(populated.choice.value.getTime(), date.getTime());
  assertTimestamp(message.time);
});

test('populateInPlace mutates the original message', () => {
  const message = initMessage(descriptors.dateContainer, { time: date });
  const populated = populateInPlace(descriptors.dateContainer, message, { jsDates: true });

  assert.equal(populated, message);
  assert.equal(message.time.getTime(), date.getTime());
});

test('populateInPlace converts a root Timestamp to Date', () => {
  const timestamp = timestampFromDate(date);
  const populated = populateInPlace(TimestampSchema, timestamp, { jsDates: true });

  assert.equal(populated.getTime(), date.getTime());
});

test('generateGrpcServices builds service definitions from files and services', () => {
  const fromFile = generateGrpcServices(descriptors.file);
  const fromService = generateGrpcServices(descriptors.service);
  const method = fromFile['test.TestService'].UnaryTime;

  assert.deepEqual(Object.keys(fromService), ['test.TestService']);
  assert.equal(method.path, '/test.TestService/UnaryTime');
  assert.equal(method.originalName, 'unaryTime');
  assert.equal(method.requestStream, false);
  assert.equal(method.responseStream, false);
  assert.equal(fromFile['test.TestService'].ServerStreamTime.responseStream, true);
  assert.equal(fromFile['test.TestService'].ClientStreamTime.requestStream, true);
  assert.equal(fromFile['test.TestService'].BidiTime.requestStream, true);
  assert.equal(fromFile['test.TestService'].BidiTime.responseStream, true);
});

test('generateGrpcServices serializes Date inputs and deserializes with population options', () => {
  const services = generateGrpcServices(descriptors.service, { jsDates: true });
  const method = services['test.TestService'].UnaryTime;

  const bytes = method.requestSerialize({ time: date });
  const request = method.requestDeserialize(bytes);

  assert.equal(Buffer.isBuffer(bytes), true);
  assert.equal(request.time.getTime(), date.getTime());
});
