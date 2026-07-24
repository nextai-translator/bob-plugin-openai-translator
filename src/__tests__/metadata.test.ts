import { describe, expect, it } from 'bun:test';
import packageMetadata from '../../package.json';
import info from '../../public/info.json';
import { DEFAULT_MODEL, MODEL_CATALOG } from '../utils/model-capabilities';
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT } from '../utils/prompt';

type MenuOption = {
  defaultValue?: string;
  desc?: string;
  identifier: string;
  menuValues?: Array<{ title: string; value: string }>;
  textConfig?: {
    height?: unknown;
    keyWords?: string[];
    placeholderText?: string;
  };
};

const options = info.options as MenuOption[];
const getOption = (identifier: string): MenuOption => {
  const option = options.find((item) => item.identifier === identifier);
  if (!option) throw new Error(`Missing option: ${identifier}`);
  return option;
};

describe('info.json consistency', () => {
  it('matches the runtime model catalog', () => {
    expect(getOption('model').menuValues?.slice(1)).toEqual(
      MODEL_CATALOG.map(({ id }) => ({ title: id, value: id })),
    );
  });

  it('sorts menu values while keeping custom model first', () => {
    for (const option of options) {
      if (!option.menuValues) continue;
      const values = option.menuValues.map((item) => item.value);
      const sortable = option.identifier === 'model' ? values.slice(1) : values;
      expect(sortable).toEqual(
        [...sortable].sort((left, right) =>
          left.localeCompare(right, 'en', { sensitivity: 'base' }),
        ),
      );
    }
    expect(getOption('model').menuValues?.[0]?.value).toBe('custom');
  });

  it('defaults to the API-key-only path', () => {
    const identifiers = options.map((option) => option.identifier);
    expect(identifiers[0]).toBe('apiKeys');
    expect(identifiers[1]).toBe('apiUrl');
    expect(identifiers).not.toContain('serviceProvider');
    expect(identifiers).not.toContain('apiPath');
    expect(identifiers).not.toContain('endpoint');
    expect(identifiers).not.toContain('temperature');
    expect(identifiers).toContain('apiUrl');
    expect(identifiers).toContain('customSystemPrompt');
    expect(identifiers).toContain('customUserPrompt');
    expect(identifiers).toContain('reasoningMode');
    expect(getOption('model').defaultValue).toBe(DEFAULT_MODEL);
    expect(getOption('reasoningMode').defaultValue).toBe('default');
    expect(getOption('reasoningMode').menuValues).toEqual([
      { title: '默认', value: 'default' },
      { title: '关闭', value: 'disable' },
    ]);
    expect(getOption('stream').defaultValue).toBe('enable');
    expect(getOption('customSystemPrompt').defaultValue).toBe(
      DEFAULT_SYSTEM_PROMPT,
    );
    expect(getOption('customUserPrompt').defaultValue).toBe(
      DEFAULT_USER_PROMPT,
    );
    expect(info.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(packageMetadata.version).toBe(info.version);
  });

  it('uses numeric text heights required by the Bob schema', () => {
    for (const option of options) {
      if (option.textConfig?.height !== undefined) {
        expect(typeof option.textConfig.height).toBe('number');
      }
    }
  });

  it('keeps the configuration UI Chinese-first', () => {
    expect(JSON.stringify(info)).toContain('默认');
    expect(JSON.stringify(info)).toContain('系统指令');
  });

  it('uses the clickable homepage for documentation', () => {
    expect(info.homepage).toBe(
      'https://github.com/nextai-translator/bob-plugin-openai-translator/blob/main/docs/configuration_manual_CN.md',
    );
    for (const option of options) {
      if (!option.desc) continue;
      expect(option.desc).not.toContain('http');
      for (const paragraph of option.desc.split('\n')) {
        expect(paragraph).not.toMatch(/[。.]\s*$/);
      }
    }
  });

  it('keeps prompt defaults, placeholders, and highlighted variables', () => {
    for (const identifier of ['customSystemPrompt', 'customUserPrompt']) {
      const option = getOption(identifier);
      expect(option.defaultValue).toBeString();
      expect(option.textConfig?.placeholderText).toBe(
        option.defaultValue ?? '',
      );
      expect(option.textConfig?.keyWords).toEqual([
        '$text',
        '$sourceLang',
        '$targetLang',
      ]);
    }
  });
});
