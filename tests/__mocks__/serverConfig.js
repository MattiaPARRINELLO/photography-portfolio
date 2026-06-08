// Mock minimaliste pour server/config
var path = require('path');

var config = {
  getPaths: jest.fn(function () {
    return {
      root: '/fake/root',
      pages: '/fake/pages',
      adminPages: '/fake/pages/admin',
      config: '/fake/config/config.json',
      texts: '/fake/config/texts.json',
      photos: '/fake/photos',
      temp: '/fake/temp'
    };
  }),
  getConfig: jest.fn(function () { return {}; }),
  getPort: jest.fn(function () { return 3000; }),
  adminPassword: 'admin-test-password',
  reloadConfig: jest.fn()
};

module.exports = config;
