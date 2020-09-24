const Browser = require('zombie');
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001; 
Browser.localhost('example.com', PORT);
const fs = require('fs');
const app = require('../../app');

/**
 * `mock-fs` stubs the entire file system. So if a module hasn't
 * already been `require`d the tests will fail because the 
 * module doesn't exist in the mocked file system. `ejs` and
 * `iconv-lite/encodings` are required here to solve that 
 * problem.
 */
const mock = require('mock-fs');
const mockAndUnmock = require('../support/mockAndUnmock')(mock);

describe('landing page', () => {
  const browser = new Browser();

  beforeEach(done => {
    done();
  });

  afterEach(() => {
    mock.restore();
  });

  it('displays the page title set in .env', done => { 
    browser.visit('/', (err) => {
      if (err) return done.fail(err);
      browser.assert.success();
      browser.assert.text('#page h1 a', process.env.TITLE);
      done();
    });
  });

  it('displays a message if there are no images to view', done => {
    mockAndUnmock({ 'public/images/uploads': {} });

    browser.visit('/', (err) => {
      if (err) return done.fail(err);
      browser.assert.success();
      browser.assert.text('h2', 'No images');
      done();
    });
  });

  it('displays the images in the public uploads directory', done => {
    mockAndUnmock({ 
      'public/images/uploads': {
        'image1.jpg': fs.readFileSync('spec/files/troll.jpg'),
        'image2.jpg': fs.readFileSync('spec/files/troll.jpg'),
        'image3.jpg': fs.readFileSync('spec/files/troll.jpg'),
      }
    });

    browser.visit('/', (err) => {
      mock.restore();
      if (err) return done.fail(err);
      browser.assert.success();
      browser.assert.elements('section img', 3);

      // No pagination
      browser.assert.elements('#next-page', 0);
      browser.assert.elements('#previous-page', 0);

      done();
    });
  });

  it('does not display non-image files', done => {
    mockAndUnmock({ 
      'public/images/uploads': {
        'image1.jpg': fs.readFileSync('spec/files/troll.jpg'),
        'image2.pdf': fs.readFileSync('spec/files/troll.jpg'),
        'image3.doc': fs.readFileSync('spec/files/troll.jpg'),
      },
    });

    browser.visit('/', (err) => {
      mock.restore();
      if (err) return done.fail(err);
      browser.assert.success();
      browser.assert.elements('section img', 1);
      done();
    });
  });

  it('displays image files with wonky capitalization on the filename extension', done => {
    mockAndUnmock({ 
      './public/images/uploads': {
        'image1.Jpg': fs.readFileSync('spec/files/troll.jpg'),
        'image2.pdf': fs.readFileSync('spec/files/troll.jpg'),
        'image3.GIF': fs.readFileSync('spec/files/troll.jpg'),
      },
    });

    browser.visit('/', (err) => {
      mock.restore();
      if (err) return done.fail(err);
      browser.assert.success();
      browser.assert.elements('section img', 2);
      done();
    });
  });

  describe('pagination', () => {
    beforeEach(done => {
      let files = {};
      for (let i = 0; i < 70; i++) {
        files[`image${i}.jpg`] = fs.readFileSync('spec/files/troll.jpg');
      }
      mockAndUnmock({ 'public/images/uploads': files });

      done();
    });

    it('paginates images in the public uploads directory', done => {
      browser.visit('/', (err) => {
        if (err) return done.fail(err);
        browser.assert.success();
        browser.assert.elements('section img', 30);
        browser.assert.elements('#next-page', 2);
        browser.assert.link('#next-page', 'Next >', '/page/2');
        browser.assert.elements('#previous-page', 0);

        browser.clickLink('#next-page', (err) => {
          if (err) return done.fail(err);
          browser.assert.elements('section img', 30);
          browser.assert.link('#next-page', 'Next >', '/page/3');
          browser.assert.link('#prev-page', '< Previous', '/page/1');

          browser.clickLink('#next-page', (err) => {
            if (err) return done.fail(err);
            browser.assert.elements('section img', 10);
            browser.assert.elements('#next-page', 0);
            browser.assert.link('#prev-page', '< Previous', '/page/2');

            browser.clickLink('#prev-page', (err) => {
              if (err) return done.fail(err);
              browser.assert.elements('section img', 30);
              browser.assert.link('#next-page', 'Next >', '/page/3');
              browser.assert.link('#prev-page', '< Previous', '/page/1');

              browser.clickLink('#prev-page', (err) => {
                if (err) return done.fail(err);
                browser.assert.elements('section img', 30);
                browser.assert.link('#next-page', 'Next >', '/page/2');
                browser.assert.elements('#previous-page', 0);

                done();
              });
            });
          });
        });
      });
    });

    it('doesn\'t barf if paginating beyond the bounds', done => {
      browser.visit('/page/10', (err) => {
        if (err) return done.fail(err);
        browser.assert.text('h2', 'No images');

        browser.visit('/page/0', (err) => {
          if (err) return done.fail(err);
          browser.assert.text('h2', 'No images');

          done();
          // Negative page params work, kinda
        });
      });
    });
  });
});
