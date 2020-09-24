/**
 * There has got to be a better way... what am I missing?
 */
const fs = require('fs');

require('../../node_modules/raw-body/node_modules/iconv-lite/encodings');
require('../../node_modules/negotiator/lib/mediaType');
require('../../node_modules/iconv-lite/encodings');
require('ejs');

module.exports = function(mock) {
  return function(mocks) {
    mock({
      ...mocks,
      'spec/files/troll.jpg': fs.readFileSync('spec/files/troll.jpg'),
      'spec/files/troll.png': fs.readFileSync('spec/files/troll.png'),
      'views/index.ejs': fs.readFileSync('views/index.ejs'),
      'views/_partials/appLink.ejs': fs.readFileSync('views/_partials/appLink.ejs'),
      'views/_partials/head.ejs': fs.readFileSync('views/_partials/head.ejs'),
      'views/_partials/matomo.ejs': fs.readFileSync('views/_partials/matomo.ejs'),
      'views/_partials/navbar.ejs': fs.readFileSync('views/_partials/navbar.ejs'),
      'views/_partials/messages.ejs': fs.readFileSync('views/_partials/messages.ejs'),
      'views/_partials/login.ejs': fs.readFileSync('views/_partials/login.ejs'),
      'views/_partials/footer.ejs': fs.readFileSync('views/_partials/footer.ejs'),
      'views/_partials/pager.ejs': fs.readFileSync('views/_partials/pager.ejs'),
      'views/agent/index.ejs': fs.readFileSync('views/agent/index.ejs'),
      'views/image/index.ejs': fs.readFileSync('views/image/index.ejs'),
      'views/image/show.ejs': fs.readFileSync('views/image/show.ejs'),
      'views/image/_pager.ejs': fs.readFileSync('views/image/_pager.ejs'),
      'views/error.ejs': fs.readFileSync('views/error.ejs'),
      'views/reset.ejs': fs.readFileSync('views/reset.ejs'),
    });
  };
};
