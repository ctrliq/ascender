import getDocsBaseUrl from './getDocsBaseUrl';

describe('getDocsBaseUrl', () => {
//   it('should return latest version for open license', () => {
//     const result = getDocsBaseUrl({
//       license_info: {
//         license_type: 'open',
//       },
//       version: '18.4.4',
//     });

//     expect(result).toEqual(
//       'https://docs.ascender-automation.org'
//     );
//   });

//   it('should return current version for enterprise license', () => {
//     const result = getDocsBaseUrl({
//       license_info: {
//         license_type: 'enterprise',
//       },
//       version: '18.4.4',
//     });

//     expect(result).toEqual(
//       'https://docs.ascender-automation.org'
//     );
//   });

//   it('should strip version info after hyphen', () => {
//     const result = getDocsBaseUrl({
//       license_info: {
//         license_type: 'enterprise',
//       },
//       version: '7.0.0-beta',
//     });

//     expect(result).toEqual(
//       'https://docs.ascender-automation.org'
//     );
//   });

//   it('should return 4.5 version if license info missing', () => {
  it('should return docs site', () => {
    const result = getDocsBaseUrl({
      version: '18.4.4',
    });

    expect(result).toEqual(
      'https://docs.ascender-automation.org'
    );
  });
});
