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

  let agent, lanny, browser;

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
            done();
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

  it('executes the wave audio visualizer client-side script', done => {
    let executed = false;
    // See foobar404/wave dependency
    let re = new RegExp('bundle\.iife\.js');
    let browser = new Browser({ loadCss: true });

    browser.on('evaluated', (code, result, filename) => {
      if (re.test(filename)) {
        executed = true;
      }
    });

    browser.visit('/', err => {
      if (err) return done.fail(err);
      expect(executed).toBe(true);

      done();
    });
  });

  describe('unauthenticated', () => {

    beforeEach(done => {
      mockAndUnmock({
        'public/tracks/uploads': {
          'track1.ogg': fs.readFileSync('spec/files/troll.ogg'),
          'track2.ogg': fs.readFileSync('spec/files/troll.ogg'),
          'lanny1.ogg': fs.readFileSync('spec/files/troll.ogg'),
          'lanny2.ogg': fs.readFileSync('spec/files/troll.ogg'),
        }
      });

      const tracks = [
        { path: `uploads/${agent.getAgentDirectory()}/track1.ogg`, recordist: agent._id, published: new Date() },
        { path: `uploads/${agent.getAgentDirectory()}/track2.ogg`, recordist: agent._id, published: null },
        { path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`, recordist: lanny._id, published: new Date() },
        { path: `uploads/${lanny.getAgentDirectory()}/lanny2.ogg`, recordist: lanny._id, published: null },
      ];

      models.Track.create(tracks).then(results => {
        done();
      }).catch(err => {
        done.fail(err);
      });
    });

    it('displays the page title set in .env', done => {
      browser.visit('/', (err) => {
        if (err) return done.fail(err);
        browser.assert.success();
        browser.assert.text('#page h1 a', process.env.TITLE);
        done();
      });
    });

    it('displays a message if there are no tracks to view', done => {
      models.Track.remove({ published: { '$ne': null } }).then(results => {
        browser.visit('/', (err) => {
          if (err) return done.fail(err);
          browser.assert.success();
          browser.assert.text('h2', 'No tracks');
          done();
        });
      }).catch(err => {
        done.fail(err);
      });
    });

    it('displays the published tracks without their stats or links', done => {
      browser.visit('/', (err) => {
        if (err) return done.fail(err);
        browser.assert.success();

        browser.assert.elements('article.post section.track audio', 2);
        browser.assert.elements(`article.post section.track audio[src="/uploads/${agent.getAgentDirectory()}/track1.ogg"]`, 1);
        browser.assert.elements(`article.post section.track audio[src="/uploads/${lanny.getAgentDirectory()}/lanny1.ogg"]`, 1);

        // No links to show pic view
        browser.assert.elements('article.post section.track a', 0);

        browser.assert.elements('article.post header', 0);
        browser.assert.elements('article.post section.feedback-controls', 0);

        // No pagination
        browser.assert.elements('#next-page', 0);
        browser.assert.elements('#previous-page', 0);

        done();
      });
    });

    describe('track post layout', () => {

      let track;
      beforeEach(done => {

        /**
         * It's just easier to work with one post...
         */
        models.Track.deleteMany({}, res => {

          models.Track.create({ path: `uploads/${agent.getAgentDirectory()}/track1.ogg`, recordist: agent._id, published: new Date() }).then(results => {

            track = results;
            browser.visit('/', err => {
              if (err) return done.fail(err);
              browser.assert.success();
              done();
            });
          }).catch(err => {
            done.fail(err);
          });
        }).catch(err => {
          done.fail(err);
        });
      });

      describe('no name set', () => {
        it('sets filename as name', () => {
          expect(track.name).toEqual('');
          browser.assert.element('article.post section.track figure figcaption');
          browser.assert.text('article.post section.track figure figcaption', 'track1.ogg');
        });
      });

      describe('name set', () => {
        beforeEach(done => {
          track.name = 'Austin Powers';
          track.save().then(results => {
            done();
          }).catch(err => {
            done.fail(err);
          });
        });

        it('sets assigned name as name', () => {
          expect(track.name).toEqual('Austin Powers');
          browser.assert.element('article.post section.track figure figcaption');
          browser.assert.text('article.post section.track figure figcaption', 'Austin Powers');
        });
      });
    });

    describe('pagination', () => {
      beforeEach(done => {
        models.mongoose.connection.db.dropCollection('tracks').then((err, result) => {

          // Create a bunch of tracks
          let files = {},
              tracks = [];
          for (let i = 0; i < 70; i++) {
            files[`lanny${i}.ogg`] = fs.readFileSync('spec/files/troll.ogg');
            tracks.push({ path: `uploads/${lanny.getAgentDirectory()}/lanny${i}.ogg`, recordist: agent._id, published: new Date() });
          }

          mockAndUnmock({ [`uploads/${lanny.getAgentDirectory()}`]: files });

          models.Track.create(tracks).then(results => {
            done();
          }).catch(err => {
            done.fail(err);
          });
        }).catch(err => {
          done.fail(err);
        });
      });

      it('paginates tracks in the public uploads directory', done => {
        browser.visit('/', (err) => {
          if (err) return done.fail(err);
          browser.assert.success();
          browser.assert.elements('section audio', 30);
          browser.assert.elements('#next-page', 2);
          browser.assert.link('#next-page', 'Next >', '/page/2');
          browser.assert.elements('#previous-page', 0);

          browser.clickLink('#next-page', (err) => {
            if (err) return done.fail(err);
            browser.assert.elements('section audio', 30);
            browser.assert.link('#next-page', 'Next >', '/page/3');
            browser.assert.link('#prev-page', '< Previous', '/page/1');

            browser.clickLink('#next-page', (err) => {
              if (err) return done.fail(err);
              browser.assert.elements('section audio', 10);
              browser.assert.elements('#next-page', 0);
              browser.assert.link('#prev-page', '< Previous', '/page/2');

              browser.clickLink('#prev-page', (err) => {
                if (err) return done.fail(err);
                browser.assert.elements('section audio', 30);
                browser.assert.link('#next-page', 'Next >', '/page/3');
                browser.assert.link('#prev-page', '< Previous', '/page/1');

                browser.clickLink('#prev-page', (err) => {
                  if (err) return done.fail(err);
                  browser.assert.elements('section audio', 30);
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
          browser.assert.text('h2', 'No tracks');

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


    beforeEach(done => {
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
                  'public/tracks/uploads': {
                    'track1.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'track2.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'lanny1.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'lanny2.ogg': fs.readFileSync('spec/files/troll.ogg'),
                  }
                });

                const tracks = [
                  { path: `uploads/${agent.getAgentDirectory()}/track1.ogg`, recordist: agent._id, published: new Date() },
                  { path: `uploads/${agent.getAgentDirectory()}/track2.ogg`, recordist: agent._id, published: null },
                  { path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`, recordist: lanny._id, published: new Date() },
                  { path: `uploads/${lanny.getAgentDirectory()}/lanny2.ogg`, recordist: lanny._id, published: null },
                ];

                models.Track.create(tracks).then(results => {
                  browser.clickLink('Login', err => {
                    if (err) done.fail(err);
                    browser.assert.success();
                    browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}` });

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
        browser.assert.text('#page h1 a', process.env.TITLE);
        done();
      });
    });

    it('displays a message if there are no tracks to view', done => {
      models.mongoose.connection.db.dropDatabase().then((err, result) => {
        browser.visit('/', (err) => {
          if (err) return done.fail(err);
          browser.assert.success();
          browser.assert.text('h2', 'No tracks');
          done();
        });
      }).catch(err => {
        done.fail(err);
      });
    });

    it('displays the published tracks with their stats and links', done => {
      browser.visit('/', (err) => {
        if (err) return done.fail(err);
        browser.assert.success();

        browser.assert.elements('article.post section.track audio', 2);
        browser.assert.elements(`article.post section.track audio[src="/uploads/${agent.getAgentDirectory()}/track1.ogg"]`, 1);
        browser.assert.elements(`article.post section.track audio[src="/uploads/${lanny.getAgentDirectory()}/lanny1.ogg"]`, 1);

        // Links to show track view
        //browser.assert.elements('article.post section.track figure figcaption a', 2);
        browser.assert.element(`article.post section.track a[href="/track/${agent.getAgentDirectory()}/track1.ogg"]`);
        browser.assert.element(`article.post section.track a[href="/track/${lanny.getAgentDirectory()}/lanny1.ogg"]`);

        // agent and lanny have the same picture src
        // 2020-10-8 This needs to be fleshed out as the layout is decided
        browser.assert.elements(`article.post header img.avatar[src="${agent.get('picture')}"]`, 2);
        browser.assert.elements(`article.post header aside div`, 2);
        browser.assert.elements(`article.post header aside time`, 2);
        browser.assert.elements(`article.post header span.post-menu`, 2);
        browser.assert.elements(`article.post section.feedback-controls`, 2);
        browser.assert.elements(`article.post section.feedback-controls i.like-button`, 2);

        // No pagination
        browser.assert.elements('#next-page', 0);
        browser.assert.elements('#previous-page', 0);

        done();
      });
    });

    describe('pagination', () => {
      beforeEach(done => {
        models.mongoose.connection.db.dropCollection('tracks').then((err, result) => {

          // Create a bunch of tracks
          let files = {},
              tracks = [];
          for (let i = 0; i < 70; i++) {
            files[`track${i}.ogg`] = fs.readFileSync('spec/files/troll.ogg');
            tracks.push({ path: `public/tracks/uploads/track${i}.ogg`, recordist: agent._id, published: new Date() });
          }

          mockAndUnmock({ [`uploads/${agent.getAgentDirectory()}`]: files });

          models.Track.create(tracks).then(results => {
            done();
          }).catch(err => {
            done.fail(err);
          });
        }).catch(err => {
          done.fail(err);
        });
      });

      it('paginates tracks in the public uploads directory', done => {
        browser.visit('/', (err) => {
          if (err) return done.fail(err);
          browser.assert.success();
          browser.assert.elements('section audio', 30);
          browser.assert.elements('#next-page', 2);
          browser.assert.link('#next-page', 'Next >', '/page/2');
          browser.assert.elements('#previous-page', 0);

          browser.clickLink('#next-page', (err) => {
            if (err) return done.fail(err);
            browser.assert.elements('section audio', 30);
            browser.assert.link('#next-page', 'Next >', '/page/3');
            browser.assert.link('#prev-page', '< Previous', '/page/1');

            browser.clickLink('#next-page', (err) => {
              if (err) return done.fail(err);
              browser.assert.elements('section audio', 10);
              browser.assert.elements('#next-page', 0);
              browser.assert.link('#prev-page', '< Previous', '/page/2');

              browser.clickLink('#prev-page', (err) => {
                if (err) return done.fail(err);
                browser.assert.elements('section audio', 30);
                browser.assert.link('#next-page', 'Next >', '/page/3');
                browser.assert.link('#prev-page', '< Previous', '/page/1');

                browser.clickLink('#prev-page', (err) => {
                  if (err) return done.fail(err);
                  browser.assert.elements('section audio', 30);
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
          browser.assert.text('main h2:last-child', 'No tracks');

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
