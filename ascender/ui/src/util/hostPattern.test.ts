import toHostPattern from './hostPattern';

describe('toHostPattern', () => {
  test('joins names with commas', () => {
    expect(toHostPattern(['web1', 'web2', 'db'])).toBe('web1,web2,db');
  });

  /* Ansible splits on commas where there are any, so colons inside names
     that sit beside others need nothing more. */
  test('leaves colons alone where there are several names', () => {
    expect(toHostPattern(['fe80::1', 'db:primary'])).toBe('fe80::1,db:primary');
  });

  /* A lone pattern with no comma is split on its colons unless it parses as
     one address, so a lone name holding one gets a trailing comma. */
  test('keeps a lone name with a colon whole', () => {
    expect(toHostPattern(['db:primary'])).toBe('db:primary,');
    expect(toHostPattern(['2001:db8::1'])).toBe('2001:db8::1,');
  });

  test('leaves a lone plain name as it is', () => {
    expect(toHostPattern(['web1'])).toBe('web1');
  });

  test('drops blank names, and answers nothing for none', () => {
    expect(toHostPattern(['', null, ' web1 ', undefined])).toBe('web1');
    expect(toHostPattern([])).toBe('');
  });
});
