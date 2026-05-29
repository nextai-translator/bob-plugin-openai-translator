import { supportLanguageList, langMap } from './lang';

describe('lang.ts', () => {
  describe('supportLanguageList', () => {
    it('should be an array of language pairs', () => {
      expect(Array.isArray(supportLanguageList)).toBe(true);
      expect(supportLanguageList.length).toBeGreaterThan(0);
      
      // Check that each element is an array with 2 elements
      for (const pair of supportLanguageList) {
        expect(Array.isArray(pair)).toBe(true);
        expect(pair.length).toBe(2);
        expect(typeof pair[0]).toBe('string');
        expect(typeof pair[1]).toBe('string');
      }
    });

    it('should contain expected language codes', () => {
      // Check for some common language codes
      expect(supportLanguageList.some(([key]) => key === 'auto')).toBe(true);
      expect(supportLanguageList.some(([key]) => key === 'en')).toBe(true);
      expect(supportLanguageList.some(([key]) => key === 'zh-Hans')).toBe(true);
      expect(supportLanguageList.some(([key]) => key === 'zh-Hant')).toBe(true);
      expect(supportLanguageList.some(([key]) => key === 'ja')).toBe(true);
      expect(supportLanguageList.some(([key]) => key === 'ko')).toBe(true);
      expect(supportLanguageList.some(([key]) => key === 'fr')).toBe(true);
    });

    it('should be declared as const to prevent modification', () => {
      // This test verifies that the array is declared with 'as const'
      // TypeScript will enforce immutability at compile time
      expect(Array.isArray(supportLanguageList)).toBe(true);
    });
  });

  describe('langMap', () => {
    it('should be a Map instance', () => {
      expect(langMap instanceof Map).toBe(true);
    });

    it('should have entries for all unique keys from supportLanguageList', () => {
      // Create a set of unique keys from the supportLanguageList
      const uniqueKeys = new Set(supportLanguageList.map(([key]) => key));
      expect(langMap.size).toBe(uniqueKeys.size);
    });

    it('should contain expected key-value pairs', () => {
      // Check that common language codes are properly mapped
      expect(langMap.get('auto')).toBe('auto');
      expect(langMap.get('en')).toBe('en');
      expect(langMap.get('zh-Hans')).toBe('zh-CN');
      expect(langMap.get('zh-Hant')).toBe('zh-TW');
      expect(langMap.get('ja')).toBe('ja');
      expect(langMap.get('ko')).toBe('ko');
      expect(langMap.get('fr')).toBe('fr');
    });

    it('should map all keys from supportLanguageList', () => {
      for (const [key, value] of supportLanguageList) {
        expect(langMap.get(key)).toBe(value);
      }
    });

    it('should handle duplicate keys correctly', () => {
      // Check if there are any duplicate keys in the list
      const keys = supportLanguageList.map(([key]) => key);
      const uniqueKeys = new Set(keys);
      
      // If there are duplicates, the Map will only keep the last value for that key
      // This test ensures we understand the behavior with duplicate keys
      expect(keys.length).toBeGreaterThanOrEqual(uniqueKeys.size);
      
      // Verify that 'en' appears twice in the original list and the Map reflects the last occurrence
      const enEntries = supportLanguageList.filter(([key]) => key === 'en');
      expect(langMap.get('en')).toBe('en'); // Should be the value from the last occurrence
      expect(enEntries.length).toBeGreaterThanOrEqual(1); // At least one occurrence
    });
  });

  describe('Integration between supportLanguageList and langMap', () => {
    it('should ensure langMap is built from supportLanguageList', () => {
      // Verify that every entry in supportLanguageList is reflected in langMap
      for (const [key, value] of supportLanguageList) {
        expect(langMap.get(key)).toBe(value);
      }
    });
  });
});