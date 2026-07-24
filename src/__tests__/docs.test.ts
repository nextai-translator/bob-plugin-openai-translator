import { describe, expect, it } from 'bun:test';
import info from '../../public/info.json';
import { MODEL_CATALOG } from '../utils/model-capabilities';

const read = (relativePath: string): Promise<string> =>
  Bun.file(new URL(`../../${relativePath}`, import.meta.url)).text();

describe('documentation consistency', () => {
  it('keeps both configuration manuals aligned with the model catalog', async () => {
    const manuals = await Promise.all([
      read('docs/configuration_manual_CN.md'),
      read('docs/configuration_manual_EN.md'),
    ]);

    for (const manual of manuals) {
      for (const model of MODEL_CATALOG) {
        expect(manual).toContain(`\`${model.id}\``);
      }
      expect(manual).toContain('/responses');
      expect(manual).toContain('/chat/completions');
      expect(manual).toContain('temperature');
      expect(manual).not.toMatch(/Upgrad|升级|4\.x/);
    }
    expect(manuals[0]).not.toContain('| 开启 |');
    expect(manuals[1]).not.toContain('| Enable |');
  });

  it('keeps both READMEs on the API-key-first user path', async () => {
    const [chinese, english] = await Promise.all([
      read('README.md'),
      read('docs/README_EN.md'),
    ]);

    for (const readme of [chinese, english]) {
      expect(readme).toContain(info.minBobVersion);
      expect(readme).toMatch(/API [Kk]ey/);
      expect(readme).toContain('API URL');
      expect(readme).toContain('configuration_manual_');
      expect(readme).not.toContain('temperature');
      expect(readme).not.toMatch(/Upgrading|升级说明|4\.x/);
    }
    expect(chinese.indexOf('API Key')).toBeLessThan(chinese.indexOf('API URL'));
    expect(english.indexOf('API key')).toBeLessThan(english.indexOf('API URL'));
  });
});
