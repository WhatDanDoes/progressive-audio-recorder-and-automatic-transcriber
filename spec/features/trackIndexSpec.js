const Browser = require('zombie');
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;
const DOMAIN = 'example.com';
Browser.localhost(DOMAIN, PORT);

const fs = require('fs');
const app = require('../../app');
const fixtures = require('pow-mongoose-fixtures');
const models = require('../../models');
const jwt = require('jsonwebtoken');

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

describe('trackIndexSpec', () => {
  let browser, agent, lanny;

  beforeEach(function(done) {
    browser = new Browser({ waitDuration: '30s', loadCss: false });
    //browser.debug();
    fixtures.load(__dirname + '/../fixtures/agents.js', models.mongoose, function(err) {
      models.Agent.findOne({ email: 'daniel@example.com' }).then(function(results) {
        agent = results;
        models.Agent.findOne({ email: 'lanny@example.com' }).then(function(results) {
          lanny = results;
          browser.visit('/', function(err) {
            if (err) return done.fail(err);
            browser.assert.success();
            done();
          });
        }).catch(function(error) {
          done.fail(error);
        });
      }).catch(function(error) {
        done.fail(error);
      });
    });
  });

  afterEach(function(done) {
    models.mongoose.connection.db.dropDatabase().then(result => {
      done();
    }).catch(function(err) {
      done.fail(err);
    });
  });

  describe('authenticated', () => {
    beforeEach(done => {
      stubAuth0Sessions(agent.email, DOMAIN, err => {
        if (err) done.fail(err);

        mockAndUnmock({
          [`uploads/${agent.getAgentDirectory()}`]: {
            'track1.ogg': fs.readFileSync('spec/files/troll.ogg'),
            'track2.ogg': fs.readFileSync('spec/files/troll.ogg'),
            'track3.ogg': fs.readFileSync('spec/files/troll.ogg'),
          },
          'public/tracks/uploads': {}
        });

        const tracks = [
          { path: `uploads/${agent.getAgentDirectory()}/track1.ogg`, recordist: agent._id },
          { path: `uploads/${agent.getAgentDirectory()}/track2.ogg`, recordist: agent._id },
          { path: `uploads/${agent.getAgentDirectory()}/track3.ogg`, recordist: agent._id },
        ];
        models.Track.create(tracks).then(results => {

          browser.clickLink('Login', err => {
            if (err) done.fail(err);
            browser.assert.success();
            browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}` });
            done();
          });
        }).catch(err => {
          done.fail(err);
        });
      });
    });

    afterEach(() => {
      mock.restore();
    });

    describe('authorized', () => {

      it('displays an add-photo form', done => {
        browser.headers = {'user-agent': 'Mozilla/5.0 (Linux; Android 8.0.0; SM-G960F Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.84 Mobile Safari/537.36'};
        browser.visit(`/track/${agent.getAgentDirectory()}`, err => {
          if (err) return done.fail(err);

          browser.assert.success();
          browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}`});
          browser.assert.element('.deep-link');
          browser.assert.element('form[action="/track"][method="post"]');
          browser.assert.element('input[id="photos-input"][type="file"][accept="audio/*"]');
          browser.assert.text('label[for="photos-input"]', 'Add track');
          browser.assert.element('label[for="photos-input"] img[src="/images/bpe-logo.png"]');
          done();
        });
      });

      //
      // Removing augmented native app...
      //
//      it('displays an Android deep link with JWT if browser is mobile', done => {
//        // This is just easier than setting up a spy, because Auth0 stubbing needs `jwt`
//        // See `GET /track/:domain/:agentId`
//        const token = jwt.sign({ email: agent.email }, process.env.SECRET, { expiresIn: '1h' });
//
//        browser.headers = {'user-agent': 'Mozilla/5.0 (Linux; Android 8.0.0; SM-G960F Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.84 Mobile Safari/537.36'};
//        browser.visit(`/track/${agent.getAgentDirectory()}`, err => {
//          if (err) return done.fail(err);
//
//          browser.assert.success();
//          browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}`});
//          browser.assert.element(`a[href="bpe://bpe?token=${token}&domain=${encodeURIComponent(process.env.DOMAIN)}"]`);
//          browser.assert.element('.deep-link');
//          done();
//        });
//      });
//
//      it('does not display an Android deep link if browser is not mobile', done => {
//        // This is just easier than setting up a spy, because Auth0 stubbing needs `jwt`
//        // See `GET /track/:domain/:agentId`
//        const token = jwt.sign({ email: agent.email }, process.env.SECRET, { expiresIn: '1h' });
//
//        browser.visit(`/track/${agent.getAgentDirectory()}`, err => {
//          if (err) return done.fail(err);
//          browser.assert.success();
//
//          browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}`});
//          browser.assert.elements(`a[href="bpe://bpe?token=${token}&domain=${encodeURIComponent(process.env.DOMAIN)}"]`, 0);
//          browser.assert.text('section h2', 'This web app is augmented with a native Android app');
//          browser.assert.text('section h3', 'Login from your tablet or phone to send photos');
//
//          done();
//        });
//      });

      it('allows an agent to view his own album', () => {
        browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}`});
        browser.assert.elements('article.post section.track img', 3);
        browser.assert.elements('article.post section.track-controls', 3);
      });

      it('allows an agent to view an album he can read', done => {
        expect(agent.canRead.length).toEqual(1);
        expect(agent.canRead[0]).toEqual(lanny._id);

        browser.visit(`/track/${lanny.getAgentDirectory()}`, err => {
          if (err) return done.fail(err);
          browser.assert.success();
          browser.assert.text('main h2:last-child', 'No tracks');
          done();
        });
      });

      it('creates an agent directory if it does not exist already', done => {
        expect(fs.existsSync(`uploads/${lanny.getAgentDirectory()}`)).toBe(false);
        browser.visit(`/track/${lanny.getAgentDirectory()}`, function(err) {
          if (err) return done.fail(err);
          browser.assert.success();
          expect(fs.existsSync(`uploads/${lanny.getAgentDirectory()}`)).toBe(true);
          done();
        });
      });

      it('redirects /track to agent\'s personal album', done => {
        browser.visit(`/track`, function(err) {
          if (err) return done.fail(err);
          browser.assert.redirected();
          browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}`});
          done();
        });
      });
    });

    describe('unauthorized', () => {
      it('does not allow an agent to view an album for which he has not been granted access', done => {
        models.Agent.findOne({ email: 'troy@example.com' }).then(function(troy) {
          expect(agent.canRead.length).toEqual(1);
          expect(agent.canRead[0]).not.toEqual(troy._id);

          browser.visit(`/track/${troy.getAgentDirectory()}`, function(err) {
            if (err) return done.fail(err);
            browser.assert.redirected();
            browser.assert.url({ pathname: '/'});
            browser.assert.text('.alert.alert-danger', 'You are not authorized to access that resource');
            done();
          });
        }).catch(function(error) {
          done.fail(error);
        });
      });
    });
  });

  describe('unauthenticated', () => {
    it('redirects home (which is where the login form is located)', done => {
      browser.visit(`/track/${agent.getAgentDirectory()}`, function(err) {
        if (err) return done.fail(err);
        browser.assert.redirected();
        browser.assert.url({ pathname: '/'});
        browser.assert.text('.alert.alert-danger', 'You need to login first');
        done();
      });
    });

    it('redirects /track to home', done => {
      browser.visit('/track', function(err) {
        if (err) return done.fail(err);
        browser.assert.redirected();
        browser.assert.url({ pathname: '/'});
        browser.assert.text('.alert.alert-danger', 'You need to login first');
        done();
      });
    });
  });

  describe('pagination', () => {
    beforeEach(done => {

      stubAuth0Sessions(agent.email, DOMAIN, err => {
        if (err) done.fail(err);

        // Create a bunch of tracks
        let files = {},
            tracks = [];
        for (let i = 0; i < 70; i++) {
          files[`track${i}.ogg`] = fs.readFileSync('spec/files/troll.ogg');
          tracks.push({ path: `uploads/${agent.getAgentDirectory()}/track${i}.ogg`, recordist: agent._id });
        }

        mockAndUnmock({ [`uploads/${agent.getAgentDirectory()}`]: files });

        models.Track.create(tracks).then(results => {

          browser.clickLink('Login', err => {
            if (err) done.fail(err);
            browser.assert.success();
            browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}` });
            done();
          });
        }).catch(err => {
          done.fail(err);
        });
      });
    });

    afterEach(() => {
      mock.restore();
    });

    it('paginates tracks in the agent\'s album', done => {
      browser.visit(`/track/${agent.getAgentDirectory()}`, (err) => {
        if (err) return done.fail(err);
        browser.assert.success();
        browser.assert.elements('section.track img', 30);
        browser.assert.elements('#next-page', 2);
        browser.assert.link('#next-page', 'Next', `/track/${agent.getAgentDirectory()}/page/2`);
        browser.assert.elements('#previous-page', 0);

        browser.clickLink('#next-page', (err) => {
          if (err) return done.fail(err);
          browser.assert.elements('section.track img', 30);
          browser.assert.link('#next-page', 'Next', `/track/${agent.getAgentDirectory()}/page/3`);
          browser.assert.link('#prev-page', 'Previous', `/track/${agent.getAgentDirectory()}/page/1`);

          browser.clickLink('#next-page', (err) => {
            if (err) return done.fail(err);
            browser.assert.elements('section.track img', 10);
            browser.assert.elements('#next-page', 0);
            browser.assert.link('#prev-page', 'Previous', `/track/${agent.getAgentDirectory()}/page/2`);

            browser.clickLink('#prev-page', (err) => {
              if (err) return done.fail(err);
              browser.assert.elements('section.track img', 30);
              browser.assert.link('#next-page', 'Next', `/track/${agent.getAgentDirectory()}/page/3`);
              browser.assert.link('#prev-page', 'Previous', `/track/${agent.getAgentDirectory()}/page/1`);

              browser.clickLink('#prev-page', (err) => {
                if (err) return done.fail(err);
                browser.assert.elements('section.track img', 30);
                browser.assert.link('#next-page', 'Next', `/track/${agent.getAgentDirectory()}/page/2`);
                browser.assert.elements('#previous-page', 0);

                done();
              });
            });
          });
        });
      });
    });

    it('doesn\'t barf if paginating beyond the bounds', done => {
      browser.visit(`/track/${agent.getAgentDirectory()}/page/10`, (err) => {
        if (err) return done.fail(err);
        browser.assert.text('main h2:last-child', 'No tracks');

        browser.visit(`/track/${agent.getAgentDirectory()}/page/0`, (err) => {
          if (err) return done.fail(err);
          browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}` });
          browser.assert.elements('.alert.alert-danger', 0);

          browser.visit(`/track/${agent.getAgentDirectory()}/page/-1`, (err) => {
            if (err) return done.fail(err);
            browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}` });
            browser.assert.elements('.alert.alert-danger', 0);

            done();
          });
        });
      });
    });
  });
});
