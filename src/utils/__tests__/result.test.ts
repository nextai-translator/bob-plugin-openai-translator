import { describe, expect, it } from 'bun:test';
import { extractResultText } from '../result';

describe('result extraction', () => {
  it('returns the block without surrounding commentary or blank lines', () => {
    expect(
      extractResultText(
        'Note: kept names.\n<result>\n你好\n</result>\nDone.',
        true,
        'Hello',
      ),
    ).toBe('你好');
  });

  it('keeps the indentation of the first line', () => {
    expect(extractResultText('<result>    code\n</result>', true, 'x')).toBe(
      '    code',
    );
  });

  it('returns the last non-empty block after a self-correction', () => {
    const reply =
      '<result>good坏参半</result>\n\nWait, corrected:\n\n<result>好坏参半</result>';
    expect(extractResultText(reply, true, 'mixed bag')).toBe('好坏参半');
    expect(extractResultText(`${reply}\n<result></result>`, true, 'x')).toBe(
      '好坏参半',
    );
  });

  it('keeps a closed block over a later unfinished one', () => {
    expect(
      extractResultText('<result>第一版</result>\n<result>半句', true, 'x'),
    ).toBe('第一版');
    expect(
      extractResultText('<result>你好</result>\n<result>您</res', true, 'x'),
    ).toBe('你好');
    expect(extractResultText('<result>你好', true, 'x')).toBe('你好');
  });

  it('treats only the exact tags in the source as its own', () => {
    expect(
      extractResultText(
        '<result>一</result>\nWait, corrected:\n<result>二</result>',
        true,
        'Close </results> here.',
      ),
    ).toBe('二');
  });

  it('returns nothing for an empty block', () => {
    expect(extractResultText('<result></result>', true, 'x')).toBe('');
  });

  it('drops a closing tag from a reply without the opening tag', () => {
    expect(extractResultText('你好</result>\n', true, 'Hello')).toBe('你好');
    expect(extractResultText('添加 </result>', true, 'Append </result>')).toBe(
      '添加 </result>',
    );
  });

  it('shows nothing outside a block while streaming', () => {
    expect(extractResultText('Note: kept names.\n', false, 'x')).toBe('');
    expect(extractResultText('Note: kept names.\n<res', false, 'x')).toBe('');
    expect(extractResultText('plain text', true, 'x')).toBe('plain text');
  });

  it('keeps result tags that belong to a source containing them', () => {
    expect(
      extractResultText(
        '<result>保存前添加 </result>。</result>',
        true,
        'Add </result> before saving.',
      ),
    ).toBe('保存前添加 </result>。');
    expect(
      extractResultText(
        '<result>用 <result>x</result> 包住</result>',
        true,
        'Wrap it in <result>x</result>',
      ),
    ).toBe('用 <result>x</result> 包住');
    expect(
      extractResultText(
        '<result>用 <result>x</result> 包',
        false,
        'Wrap it in <result>x</result>',
      ),
    ).toBe('用 <result>x</result> 包');
    expect(
      extractResultText(
        '<result>用 <result>x</res',
        false,
        'Wrap it in <result>x</result>',
      ),
    ).toBe('用 <result>x');
  });

  it('streams one block and swaps in a correction once it closes', () => {
    expect(extractResultText('<resu', false, 'x')).toBe('');
    expect(extractResultText('<result>你好</res', false, 'x')).toBe('你好');
    expect(extractResultText('<result>你好', false, 'x')).toBe('你好');
    expect(
      extractResultText('<result>一</result>\nWait\n<result>', false, 'x'),
    ).toBe('一');
    expect(
      extractResultText('<result>一</result>\nWait\n<result>二', false, 'x'),
    ).toBe('一');
    expect(
      extractResultText(
        '<result>一</result>\nWait\n<result>二</result>',
        false,
        'x',
      ),
    ).toBe('二');
  });
});
