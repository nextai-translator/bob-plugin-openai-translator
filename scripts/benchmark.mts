#!/usr/bin/env bun

import path from 'node:path';
import type { TextTranslateQuery } from '@bob-translate/types';
import { getServiceAdapter } from '../src/adapter';
import { parseOptions } from '../src/config';
import { resolveModelControls } from '../src/utils/model-capabilities';
import { SseStreamHandler } from '../src/utils/sse';

const SAMPLES = 9;
const ITERATIONS = 100_000;

const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

const measure = (operation: () => void): number => {
  for (let index = 0; index < 10_000; index += 1) operation();
  const samples: number[] = [];
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    const start = Bun.nanoseconds();
    for (let index = 0; index < ITERATIONS; index += 1) operation();
    samples.push((Bun.nanoseconds() - start) / ITERATIONS);
  }
  return median(samples);
};

const config = parseOptions({
  apiKeys: 'benchmark-key',
  apiUrl: '',
  customModel: '',
  customSystemPrompt: '',
  customUserPrompt: '',
  model: 'gpt-5.6-luna',
  reasoningMode: 'default',
  stream: 'enable',
});
const adapter = getServiceAdapter(config);
const query = {
  text: 'Benchmark translation',
  detectFrom: 'en',
  detectTo: 'zh-Hans',
  onStream: () => {},
} as unknown as TextTranslateQuery;

const streamParser = new SseStreamHandler({
  troubleshootingLink: '',
  extractDelta: (data) => (typeof data.delta === 'string' ? data.delta : null),
  extractError: () => null,
  isComplete: () => false,
});
const streamEvent =
  'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"x"}\n\n';

const results = {
  capabilityResolution: measure(() => {
    resolveModelControls('openai', 'gpt-5.6-luna', 'default');
  }),
  providerConstruction: measure(() => {
    getServiceAdapter(config);
  }),
  requestConstruction: measure(() => {
    adapter.buildRequestBody(query);
  }),
  streamEventParsing: measure(() => {
    streamParser.reset(query);
    streamParser.feed(streamEvent);
  }),
};

const bundlePath = path.resolve(import.meta.dir, '../dist/main.js');
const bundleFile = Bun.file(bundlePath);
const bundleBytes = (await bundleFile.exists()) ? bundleFile.size : null;

for (const [name, nanoseconds] of Object.entries(results)) {
  console.log(`${name}: ${nanoseconds.toFixed(1)} ns/op`);
}
console.log(
  bundleBytes === null
    ? 'bundle: not built'
    : `bundle: ${bundleBytes.toLocaleString('en-US')} bytes`,
);
