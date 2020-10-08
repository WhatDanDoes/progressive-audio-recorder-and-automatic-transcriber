const Browser = require('zombie');
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;
const DOMAIN = 'example.com';
Browser.localhost(DOMAIN, PORT);
const fs = require('fs');
const app = require('../../app');

const models = require('../../models');
const fixtures = require('pow-mongoose-fixtures');
const stubAuth0Sessions = require('../support/stubAuth0Sessions');

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
  let browser;

  beforeEach(done => {
    browser = new Browser();
    done();
  });

  afterEach(() => {
    mock.restore();
  });

  describe('unauthenticated', () => {
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
            browser.assert.url({ pathname: '/' });
            browser.assert.elements('.alert.alert-danger', 0);

            browser.visit('/page/-1', (err) => {
              if (err) return done.fail(err);
              browser.assert.url({ pathname: '/' });
              browser.assert.elements('.alert.alert-danger', 0);

              done();
            });
          });
        });
      });
    });
  });

  describe('authenticated', () => {

    let agent, lanny;

    beforeEach(done => {
      browser = new Browser({ waitDuration: '30s', loadCss: false });
      //browser.debug();
      fixtures.load(__dirname + '/../fixtures/agents.js', models.mongoose, err => {
        models.Agent.findOne({ email: 'daniel@example.com' }).then(results => {
          agent = results;
          models.Agent.findOne({ email: 'lanny@example.com' }).then(results => {
            lanny = results;
            browser.visit('/', err => {
              if (err) return done.fail(err);
              browser.assert.success();

              // This and the login/logout cycle writes the agent's Auth0 profile to the database
              stubAuth0Sessions(lanny.email, DOMAIN, err => {
                if (err) done.fail(err);

                browser.clickLink('Login', err => {
                  if (err) done.fail(err);
                  browser.assert.success();

                  browser.clickLink('Logout', err => {
                    if (err) done.fail(err);
                    browser.assert.success();

                    /**
                     * 2020-10-8
                     *
                     * I just discovered that successive logins (as demonstrated here)
                     * do not work. The subsequent login returns 403, but I have not
                     * determined where the status is coming from. It does not appear to
                     * be coming from the app. I think it's coming from zombie.
                     *
                     * Starting a new browser seems to fix everything, though test setup
                     * is becoming quite verbose.
                     *
                     * It would be easier to simply setup the lanny agent in the database,
                     * but now that I've discovered the problem, I cannot let it go.
                     */
                    browser = new Browser({ waitDuration: '30s', loadCss: false });
                    browser.visit('/', err => {
                      if (err) return done.fail(err);
                      browser.assert.success();

                      // Login main test agent
                      stubAuth0Sessions(agent.email, DOMAIN, err => {
                        if (err) done.fail(err);

                        mockAndUnmock({
                          'public/images/uploads': {
                            'image1.jpg': fs.readFileSync('spec/files/troll.jpg'),
                            'lanny1.jpg': fs.readFileSync('spec/files/troll.jpg'),
                          }
                        });

                        const images = [
                          { path: `uploads/${agent.getAgentDirectory()}/image1.jpg`, photographer: agent._id, published: true },
                          { path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`, photographer: lanny._id, published: true },
                        ];

                        models.Image.create(images).then(results => {
                          browser.clickLink('Login', err => {
                            if (err) done.fail(err);
                            browser.assert.success();
                            browser.assert.url({ pathname: `/image/${agent.getAgentDirectory()}` });

                            models.Agent.findOne({ email: 'daniel@example.com' }).then(results => {
                              agent = results;
                              models.Agent.findOne({ email: 'lanny@example.com' }).then(results => {
                                lanny = results;

                                done();
                              }).catch(err => {
                                done.fail(err);
                              });
                            }).catch(err => {
                              done.fail(err);
                            });
                          });
                        }).catch(err => {
                          done.fail(err);
                        });
                      });
                    });
                  });
                });
              });
            });
          }).catch(error => {
            done.fail(error);
          });
        }).catch(error => {
          done.fail(error);
        });
      });
    });

    afterEach(done => {
      mock.restore();
      models.mongoose.connection.db.dropDatabase().then((err, result) => {
        done();
      }).catch(err => {
        done.fail(err);
      });
    });


    it('displays the page title set in .env', done => {
      browser.visit('/', (err) => {
        if (err) return done.fail(err);
        browser.assert.success();
        browser.assert.text('#page h1 a', process.env.TITLE); done(); });
    });

    it('displays a message if there are no images to view', done => {
      mockAndUnmock({ 'public/images/uploads': {} });
      models.mongoose.connection.db.dropDatabase().then((err, result) => {
        browser.visit('/', (err) => {
          if (err) return done.fail(err);
          browser.assert.success();
          browser.assert.text('h2', 'No images');
          done();
        });
      }).catch(err => {
        done.fail(err);
      });
    });

    it('displays the images and their controls', done => {
      browser.visit('/', (err) => {
        if (err) return done.fail(err);
        browser.assert.success();

        browser.assert.elements('article.post section.photo img', 2);
        // agent and lanny have the same picture src
        browser.assert.elements(`article.post header img.avatar[src="${agent.get('picture')}"]`, 2);

        // No pagination
        browser.assert.elements('#next-page', 0);
        browser.assert.elements('#previous-page', 0);

        done();
      });
    });

    describe('pagination', () => {
      beforeEach(done => {
        models.mongoose.connection.db.dropCollection('images').then((err, result) => {

          // Create a bunch of images
          let files = {},
              images = [];
          for (let i = 0; i < 70; i++) {
            files[`image${i}.jpg`] = fs.readFileSync('spec/files/troll.jpg');
            images.push({ path: `public/images/uploads/image${i}.jpg`, photographer: agent._id, published: true });
          }

          mockAndUnmock({ ['public/images/uploads']: files });

          models.Image.create(images).then(results => {
            done();
          }).catch(err => {
            done.fail(err);
          });
        }).catch(err => {
          done.fail(err);
        });
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
          browser.assert.text('main h2:last-child', 'No images');

          browser.visit('/page/0', (err) => {
            if (err) return done.fail(err);
            browser.assert.url({ pathname: '/' });
            browser.assert.elements('.alert.alert-danger', 0);

            browser.visit('/page/-1', (err) => {
              if (err) return done.fail(err);
              browser.assert.url({ pathname: '/' });
              browser.assert.elements('.alert.alert-danger', 0);

              done();
            });
          });
        });
      });
    });
  });
});
