const Browser = require('zombie');
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;
const DOMAIN = 'example.com';
Browser.localhost(DOMAIN, PORT);

const fs = require('fs');
const app = require('../../app');
const fixtures = require('pow-mongoose-fixtures');
const models = require('../../models');

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

describe('imageShowSpec', () => {
  let browser, agent, lanny;

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
    models.mongoose.connection.db.dropDatabase().then((err, result) => {
      done();
    }).catch(err => {
      done.fail(err);
    });
  });

  describe('authenticated', () => {
    beforeEach(done => {
      stubAuth0Sessions(agent.email, DOMAIN, err => {
        if (err) done.fail(err);

        mockAndUnmock({
          [`uploads/${agent.getAgentDirectory()}`]: {
            'image1.jpg': fs.readFileSync('spec/files/troll.jpg'),
            'image2.jpg': fs.readFileSync('spec/files/troll.jpg'),
            'image3.jpg': fs.readFileSync('spec/files/troll.jpg'),
          },
          'public/images/uploads': {}
        });

        const images = [
          { path: `uploads/${agent.getAgentDirectory()}/image1.jpg`, photographer: agent._id },
          { path: `uploads/${agent.getAgentDirectory()}/image2.jpg`, photographer: agent._id },
          { path: `uploads/${agent.getAgentDirectory()}/image3.jpg`, photographer: agent._id },
          { path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`, photographer: lanny._id },
          { path: `uploads/${lanny.getAgentDirectory()}/lanny2.jpg`, photographer: lanny._id, published: new Date() },
        ];
        models.Image.create(images).then(results => {

          browser.clickLink('Login', err => {
            if (err) done.fail(err);
            browser.assert.success();

            models.Agent.findOne({ email: 'daniel@example.com' }).then(results => {
              agent = results;

              done();
            }).catch(err => {
              done.fail(err);
            });
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
      it('allows an agent to click and view his own image', done => {
        browser.assert.url({ pathname: `/image/${agent.getAgentDirectory()}`});
        browser.assert.element(`.image a[href="/image/${agent.getAgentDirectory()}/image1.jpg"] img[src="/uploads/${agent.getAgentDirectory()}/image1.jpg"]`);
        browser.clickLink(`a[href="/image/${agent.getAgentDirectory()}/image1.jpg"]`, err => {
          if (err) return done.fail(err);
          browser.assert.success();

          browser.assert.element(`img[src="/uploads/${agent.getAgentDirectory()}/image1.jpg"]`);
          browser.assert.element(`article.post header img.avatar[src="${agent.get('picture')}"]`);
          browser.assert.element('article.post header aside div');
          browser.assert.element('article.post header aside time');
          browser.assert.element('article.post header span.post-menu');
          browser.assert.element('article.post section.feedback-controls');
          browser.assert.element('article.post section.feedback-controls i.like-button');
          browser.assert.element('.delete-image-form');
          browser.assert.element('.publish-image-form');

          done();
        });
      });

      it('allows an agent to view an image to which he has permission to read', done => {
        expect(agent.canRead.length).toEqual(1);
        expect(agent.canRead[0]).toEqual(lanny._id);

        browser.visit(`/image/${lanny.getAgentDirectory()}/lanny1.jpg`, err => {
          if (err) return done.fail(err);
          browser.assert.success();
          browser.assert.element(`img[src="/uploads/${lanny.getAgentDirectory()}/lanny1.jpg"]`);
          browser.assert.elements('.delete-image-form', 0);
          done();
        });
      });
    });

    describe('unauthorized', () => {
      beforeEach(done => {
        // No permissions
        agent.canRead.pop();
        agent.save().then(agent => {
          expect(agent.canRead.length).toEqual(0);
          done();
        }).catch(error => {
          done.fail(error);
        });
      });

      it('does not allow an agent to view an album for which he has not been granted access', done => {
        browser.visit(`/image/${lanny.getAgentDirectory()}/lanny1.jpg`, err => {
          if (err) return done.fail(err);
          browser.assert.redirected();
          browser.assert.url({ pathname: '/'});
          browser.assert.text('.alert.alert-danger', 'You are not authorized to access that resource');
          done();
        });
      });

      it('allows an agent to view a published image', done => {
        // Unpublished
        browser.visit(`/image/${lanny.getAgentDirectory()}/lanny1.jpg`, err => {
          if (err) return done.fail(err);
          browser.assert.success();
          browser.assert.url({ pathname: '/'});
          browser.assert.text('.alert.alert-danger', 'You are not authorized to access that resource');

          // Published in setup above
          browser.visit(`/image/${lanny.getAgentDirectory()}/lanny2.jpg`, err => {
            if (err) return done.fail(err);

            browser.assert.elements('.alert.alert-danger', 0);
            browser.assert.element(`img[src="/uploads/${lanny.getAgentDirectory()}/lanny2.jpg"]`);
            browser.assert.url({ pathname: `/image/${lanny.getAgentDirectory()}/lanny2.jpg` });
            done();
          });
        });
      });
    });
  });

  describe('unauthenticated', () => {
    it('redirects home (which is where the login form is located)', done => {
      browser.visit(`/image/${agent.getAgentDirectory()}/image2.jpg`, err => {
        if (err) return done.fail(err);
        browser.assert.redirected();
        browser.assert.url({ pathname: '/'});
        browser.assert.text('.alert.alert-danger', 'You need to login first');
        done();
      });
    });
  });
});
