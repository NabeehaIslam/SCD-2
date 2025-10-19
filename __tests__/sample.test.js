const utils = require('../src/utils'); // adjust path if needed

describe('Utils functions', () => {

  test('getTimestamp should convert HH:MM:SS to seconds', () => {
    expect(utils.getTimestamp("01:02:03")).toBe(3723); // 1*3600 + 2*60 + 3
  });

  test('md5 should return 32 char hex string', () => {
    const hash = utils.md5("hello");
    expect(hash).toHaveLength(32);
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });

  test('get_options returns object with url and method', () => {
    const opts = utils.get_options("test.aspx?");
    expect(opts).toHaveProperty("url");
    expect(opts).toHaveProperty("method", "GET");
  });

  test('post_options returns object with url and method', () => {
    const opts = utils.post_options("test.aspx", "data");
    expect(opts).toHaveProperty("url");
    expect(opts).toHaveProperty("method", "POST");
    expect(opts).toHaveProperty("body", "data");
  });

});
