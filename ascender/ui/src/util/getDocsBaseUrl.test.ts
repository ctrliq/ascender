import getDocsBaseUrl from './getDocsBaseUrl';

describe('getDocsBaseUrl', () => {
  it('should return docs site', () => {
    const result = getDocsBaseUrl({
      version: '18.4.4',
    });

    expect(result).toEqual('https://docs.ascender-automation.org');
  });
});
