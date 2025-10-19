jest.mock('node-fetch'); // mock fetch
jest.mock('fs');          // mock fs

test('dummy test', () => {
  expect(true).toBe(true);
});

const fetch = require('node-fetch');
const fs = require('fs');
const satellite = require('../src/satellite');
const utils = require('../src/utils');

const { Response } = jest.requireActual('node-fetch');



