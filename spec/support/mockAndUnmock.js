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
      'public/images/file-upload.png': fs.readFileSync('public/images/file-upload.png'),
      'public/images/mic-logo.png': fs.readFileSync('public/images/mic-logo.png'),
      'public/scripts/foobar404/wave/dist/bundle.iife.js': fs.readFileSync('public/scripts/foobar404/wave/dist/bundle.iife.js'),
      'public/scripts/mic.js': fs.readFileSync('public/scripts/mic.js'),
      'public/scripts/like.js': fs.readFileSync('public/scripts/like.js'),
      'public/scripts/upload.js': fs.readFileSync('public/scripts/upload.js'),
      'public/stylesheets/style.css': fs.readFileSync('public/stylesheets/style.css'),
      'public/stylesheets/fontawesome-free-5.9.0-web/css/all.css': fs.readFileSync('public/stylesheets/fontawesome-free-5.9.0-web/css/all.css'),
      'public/stylesheets/fontawesome-free-5.9.0-web/webfonts/fa-solid-900.woff2': fs.readFileSync('public/stylesheets/fontawesome-free-5.9.0-web/webfonts/fa-solid-900.woff2'),
      'public/stylesheets/fontawesome-free-5.9.0-web/webfonts/fa-regular-400.woff': fs.readFileSync('public/stylesheets/fontawesome-free-5.9.0-web/webfonts/fa-regular-400.woff'),
      'public/stylesheets/fontawesome-free-5.9.0-web/webfonts/fa-regular-400.woff2': fs.readFileSync('public/stylesheets/fontawesome-free-5.9.0-web/webfonts/fa-regular-400.woff2'),
      'public/stylesheets/fontawesome-free-5.9.0-web/webfonts/fa-solid-900.ttf': fs.readFileSync('public/stylesheets/fontawesome-free-5.9.0-web/webfonts/fa-solid-900.ttf'),
      'spec/files/bus.mjpeg': fs.readFileSync('spec/files/bus.mjpeg'),
      'spec/files/troll.jpg': fs.readFileSync('spec/files/troll.jpg'),
      'spec/files/troll.ogg': fs.readFileSync('spec/files/troll.ogg'),
      'spec/files/troll.png': fs.readFileSync('spec/files/troll.png'),
      'spec/files/troll.wav': fs.readFileSync('spec/files/troll.wav'),
      'views/index.ejs': fs.readFileSync('views/index.ejs'),
      'views/_partials/appLink.ejs': fs.readFileSync('views/_partials/appLink.ejs'),
      'views/_partials/head.ejs': fs.readFileSync('views/_partials/head.ejs'),
      'views/_partials/matomo.ejs': fs.readFileSync('views/_partials/matomo.ejs'),
      'views/_partials/navbar.ejs': fs.readFileSync('views/_partials/navbar.ejs'),
      'views/_partials/messages.ejs': fs.readFileSync('views/_partials/messages.ejs'),
      'views/_partials/login.ejs': fs.readFileSync('views/_partials/login.ejs'),
      'views/_partials/footer.ejs': fs.readFileSync('views/_partials/footer.ejs'),
      'views/_partials/pager.ejs': fs.readFileSync('views/_partials/pager.ejs'),
      'views/agent/admin.ejs': fs.readFileSync('views/agent/admin.ejs'),
      'views/agent/index.ejs': fs.readFileSync('views/agent/index.ejs'),
      'views/track/_controls.ejs': fs.readFileSync('views/track/_controls.ejs'),
      'views/track/flagged.ejs': fs.readFileSync('views/track/flagged.ejs'),
      'views/track/index.ejs': fs.readFileSync('views/track/index.ejs'),
      'views/track/show.ejs': fs.readFileSync('views/track/show.ejs'),
      'views/track/_feedbackControls.ejs': fs.readFileSync('views/track/_feedbackControls.ejs'),
      'views/track/_noteControls.ejs': fs.readFileSync('views/track/_noteControls.ejs'),
      'views/track/_header.ejs': fs.readFileSync('views/track/_header.ejs'),
      'views/track/_pager.ejs': fs.readFileSync('views/track/_pager.ejs'),
      'views/error.ejs': fs.readFileSync('views/error.ejs'),
      'views/reset.ejs': fs.readFileSync('views/reset.ejs'),
    });
  };
};
