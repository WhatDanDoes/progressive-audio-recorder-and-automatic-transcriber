const Browser = require('zombie');
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001; 
Browser.localhost('example.com', PORT);
const fs = require('fs');
const app = require('../../app');
const fixtures = require('pow-mongoose-fixtures');
const models = require('../../models'); 
const jwt = require('jsonwebtoken');

/**
 * `mock-fs` stubs the entire file system. So if a module hasn't
 * already been `require`d the tests will fail because the 
 * module doesn't exist in the mocked file system. `ejs` and
 * `iconv-lite/encodings` are required here to solve that 
 * problem.
 */
const mock = require('mock-fs');
const mockAndUnmock = require('../support/mockAndUnmock')(mock);

describe('imageIndexSpec', () => {
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
    models.mongoose.connection.db.dropDatabase().then(function(err, result) {
      done();
    }).catch(function(err) {
      done.fail(err);
    });
  });

  describe('authenticated', () => {
    beforeEach(done => {
      mockAndUnmock({ 
        [`uploads/${agent.getAgentDirectory()}`]: {
          'image1.jpg': fs.readFileSync('spec/files/troll.jpg'),
          'image2.jpg': fs.readFileSync('spec/files/troll.jpg'),
          'image3.jpg': fs.readFileSync('spec/files/troll.jpg'),
        },
        'public/images/uploads': {}
      });
 
      spyOn(jwt, 'sign').and.returnValue('somejwtstring');
 
      browser.fill('email', agent.email);
      browser.fill('password', 'secret');
      browser.pressButton('Login', function(err) {
        if (err) done.fail(err);
        browser.assert.success();
        done();
      });
    });
  
    afterEach(() => {
      mock.restore();
    });

    describe('authorized', () => {
      it('displays an Android deep link with JWT', () => {
        browser.assert.url({ pathname: `/image/${agent.getAgentDirectory()}`});
        browser.assert.element('a[href="bpe://somejwtstring"]');
      });

      it('allows an agent to view his own album', () => {
        browser.assert.url({ pathname: `/image/${agent.getAgentDirectory()}`});
        browser.assert.elements('section.image img', 3);
      });

      it('allows an agent to view an album he can read', done => {
        expect(agent.canRead.length).toEqual(1);
        expect(agent.canRead[0]).toEqual(lanny._id);

        browser.visit(`/image/${lanny.getAgentDirectory()}`, function(err) {
          if (err) return done.fail(err);
          browser.assert.success();
          browser.assert.text('h2', 'No images');
          done();
        });
      });

      it('creates an agent directory if it does not exist already', done => {
        expect(fs.existsSync(`uploads/${lanny.getAgentDirectory()}`)).toBe(false);
        browser.visit(`/image/${lanny.getAgentDirectory()}`, function(err) {
          if (err) return done.fail(err);
          browser.assert.success();
          expect(fs.existsSync(`uploads/${lanny.getAgentDirectory()}`)).toBe(true);
          done();
        });
      });

      it('redirects /image to agent\'s personal album', done => {
        browser.visit(`/image`, function(err) {
          if (err) return done.fail(err);
          browser.assert.redirected();
          browser.assert.url({ pathname: `/image/${agent.getAgentDirectory()}`});
          done();
        });
      });
    });

    describe('unauthorized', () => {
      it('does not allow an agent to view an album for which he has not been granted access', done => {
        models.Agent.findOne({ email: 'troy@example.com' }).then(function(troy) {
          expect(agent.canRead.length).toEqual(1);
          expect(agent.canRead[0]).not.toEqual(troy._id);

          browser.visit(`/image/${troy.getAgentDirectory()}`, function(err) {
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
      browser.visit(`/image/${agent.getAgentDirectory()}`, function(err) {
        if (err) return done.fail(err);
        browser.assert.redirected();
        browser.assert.url({ pathname: '/'});
        browser.assert.text('.alert.alert-danger', 'You need to login first');
        done();
      });
    });

    it('redirects /image to home', done => {
      browser.visit('/image', function(err) {
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
      let files = {};
      for (let i = 0; i < 70; i++) {
        files[`image${i}.jpg`] = fs.readFileSync('spec/files/troll.jpg');
      }
      mockAndUnmock({ [`uploads/${agent.getAgentDirectory()}`]: files });

      browser.fill('email', agent.email);
      browser.fill('password', 'secret');
      browser.pressButton('Login', function(err) {
        if (err) done.fail(err);
        browser.assert.success();
        done();
      });
    });

    afterEach(() => {
      mock.restore();
    });

    it('paginates images in the agent\'s album', done => {
      browser.visit(`/image/${agent.getAgentDirectory()}`, (err) => {
        if (err) return done.fail(err);
        browser.assert.success();
        browser.assert.elements('section.image img', 30);
        browser.assert.elements('#next-page', 2);
        browser.assert.link('#next-page', 'Next', `/image/${agent.getAgentDirectory()}/page/2`);
        browser.assert.elements('#previous-page', 0);

        browser.clickLink('#next-page', (err) => {
          if (err) return done.fail(err);
          browser.assert.elements('section.image img', 30);
          browser.assert.link('#next-page', 'Next', `/image/${agent.getAgentDirectory()}/page/3`);
          browser.assert.link('#prev-page', 'Previous', `/image/${agent.getAgentDirectory()}/page/1`);

          browser.clickLink('#next-page', (err) => {
            if (err) return done.fail(err);
            browser.assert.elements('section.image img', 10);
            browser.assert.elements('#next-page', 0);
            browser.assert.link('#prev-page', 'Previous', `/image/${agent.getAgentDirectory()}/page/2`);

            browser.clickLink('#prev-page', (err) => {
              if (err) return done.fail(err);
              browser.assert.elements('section.image img', 30);
              browser.assert.link('#next-page', 'Next', `/image/${agent.getAgentDirectory()}/page/3`);
              browser.assert.link('#prev-page', 'Previous', `/image/${agent.getAgentDirectory()}/page/1`);

              browser.clickLink('#prev-page', (err) => {
                if (err) return done.fail(err);
                browser.assert.elements('section.image img', 30);
                browser.assert.link('#next-page', 'Next', `/image/${agent.getAgentDirectory()}/page/2`);
                browser.assert.elements('#previous-page', 0);

                done();
              });
            });
          });
        });
      });
    });

    it('doesn\'t barf if paginating beyond the bounds', done => {
      browser.visit(`/image/${agent.getAgentDirectory()}/page/10`, (err) => {
        if (err) return done.fail(err);
        browser.assert.text('h2', 'No images');

        browser.visit(`/image/${agent.getAgentDirectory()}/page/0`, (err) => {
          if (err) return done.fail(err);
          browser.assert.text('h2', 'No images');

          done();
          // Negative page params work, kinda
        });
      });
    });
  });
});
