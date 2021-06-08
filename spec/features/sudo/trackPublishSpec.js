'use strict';

const fixtures = require('pow-mongoose-fixtures');
const models = require('../../../models');

const app = require('../../../app');

const fs = require('fs');
const mkdirp = require('mkdirp');

const Browser = require('zombie');
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;
const DOMAIN = 'example.com';
Browser.localhost(DOMAIN, PORT);

const stubAuth0Sessions = require('../../support/stubAuth0Sessions');

/**
 * `mock-fs` stubs the entire file system. So if a module hasn't
 * already been `require`d the tests will fail because the
 * module doesn't exist in the mocked file system. `ejs` and
 * `iconv-lite/encodings` are required here to solve that
 * problem.
 */
const mock = require('mock-fs');
const mockAndUnmock = require('../../support/mockAndUnmock')(mock);


// For when system resources are scarce
jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

describe('sudo Publishing a track', () => {

  let browser, agent, lanny;

  beforeEach(done => {
    browser = new Browser({ waitDuration: '30s', loadCss: false });
    //browser.debug();
    fixtures.load(__dirname + '/../../fixtures/agents.js', models.mongoose, err => {
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

  describe('from show view', () => {

    describe('authenticated', () => {

      let root;
      beforeEach(done => {
        expect(process.env.SUDO).toBeDefined();
        stubAuth0Sessions(process.env.SUDO, DOMAIN, err => {
          if (err) return done.fail(err);

          browser.clickLink('Login', err => {
            if (err) done.fail(err);
            browser.assert.success();

            browser.clickLink('Admin', function(err) {
              if (err) return done.fail(err);
              browser.assert.success();

              models.Agent.findOne({ email: process.env.SUDO }).then(results => {
                root = results;

                mockAndUnmock({
                  [`uploads/${agent.getAgentDirectory()}`]: {
                    'track1.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'track2.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'track3.ogg': fs.readFileSync('spec/files/troll.ogg'),
                  },
                  [`uploads/${lanny.getAgentDirectory()}`]: {
                    'lanny1.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'lanny2.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'lanny3.ogg': fs.readFileSync('spec/files/troll.ogg'),
                  },
                  [`uploads/${root.getAgentDirectory()}`]: {
                    'root1.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'root2.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'root3.ogg': fs.readFileSync('spec/files/troll.ogg'),
                  },
                  'public/tracks/uploads': {}
                });

                const tracks = [
                  { path: `uploads/${agent.getAgentDirectory()}/track1.ogg`, recordist: agent._id },
                  { path: `uploads/${agent.getAgentDirectory()}/track2.ogg`, recordist: agent._id },
                  { path: `uploads/${agent.getAgentDirectory()}/track3.ogg`, recordist: agent._id },
                  { path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`, recordist: lanny._id },
                  { path: `uploads/${lanny.getAgentDirectory()}/lanny2.ogg`, recordist: lanny._id },
                  { path: `uploads/${lanny.getAgentDirectory()}/lanny3.ogg`, recordist: lanny._id },
                  { path: `uploads/${root.getAgentDirectory()}/root1.ogg`, recordist: root._id },
                  { path: `uploads/${root.getAgentDirectory()}/root2.ogg`, recordist: root._id },
                  { path: `uploads/${root.getAgentDirectory()}/root3.ogg`, recordist: root._id },
                ];
                models.Track.create(tracks).then(results => {
                  done();
                }).catch(err => {
                  done.fail(err);
                });
              }).catch(err => {
                done.fail(err);
              });
            });
          });
        });
      });

      afterEach(() => {
        mock.restore();
      });

      it('renders a form to allow an agent to publish a track', done => {
        browser.clickLink(agent.getAgentDirectory(), err => {
          if (err) return done.fail(err);

          browser.clickLink(`a[href="/track/${agent.getAgentDirectory()}/track1.ogg"]`, err => {
            if (err) return done.fail(err);

            browser.assert.success();
            browser.assert.element('.publish-track-form');
            browser.assert.element(`form[action="/track/${agent.getAgentDirectory()}/track1.ogg"][method="post"]`);
            done();
          });
        });
      });

      describe('publishing', () => {

        describe('root\'s own resource', () => {

          beforeEach(done => {
            browser.clickLink('Tracks', err => {
              if (err) return done.fail(err);

              browser.clickLink(`a[href="/track/${root.getAgentDirectory()}/root1.ogg"]`, err => {
                if (err) return done.fail(err);
                browser.assert.success();
                done();
              });
            });
          });

          it('shows publish button', () => {
            browser.assert.elements('.publish-track-form', 1);
          });

          it('redirects to referring page if the publish is successful', done => {
            browser.pressButton('button.publish-track[aria-label="Publish"]', err => {
              if (err) return done.fail(err);

              browser.assert.success();
              browser.assert.text('.alert.alert-success', 'Track published');
              browser.assert.url({ pathname: `/track/${root.getAgentDirectory()}/root1.ogg` });
              done();
            });
          });

          it('sets the track to published in the database', done => {
            models.Track.find({ path: `uploads/${root.getAgentDirectory()}/root1.ogg`}).then(tracks => {
              expect(tracks.length).toEqual(1);
              expect(tracks[0].published).toEqual(null);

              browser.pressButton(`form[action="/track/${root.getAgentDirectory()}/root1.ogg"] button.publish-track[aria-label="Publish"]`, err => {
                if (err) return done.fail(err);

                models.Track.find({ path: `uploads/${root.getAgentDirectory()}/root1.ogg`}).then(tracks => {
                  expect(tracks.length).toEqual(1);
                  expect(tracks[0].published instanceof Date).toBe(true);

                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
            }).catch(err => {
              done.fail(err);
            });
          });

          describe('unpublishing', () => {
            beforeEach(done => {
              browser.pressButton('button.publish-track[aria-label="Publish"]', err => {
                if (err) return done.fail(err);
                browser.assert.success();
                done();
              });
            });

            it('shows an unpublish button on root\'s audio roll', done => {
              browser.clickLink(`a[href="/track/${root.getAgentDirectory()}"]`, err => {
                if (err) return done.fail(err);
                browser.assert.success();

                browser.assert.element(`form[action="/track/${root.getAgentDirectory()}/root1.ogg"] button.publish-track[aria-label="Unpublish"]`);
                done();
              });
            });

            it('shows an unpublish button on the track\'s show view', () => {
              browser.assert.url({ pathname: `/track/${root.getAgentDirectory()}/root1.ogg` });
              browser.assert.element('.publish-track-form button.publish-track[aria-label="Unpublish"]');
            });

            it('sets the track\'s published property to null in the database', done => {
              browser.assert.url({ pathname: `/track/${root.getAgentDirectory()}/root1.ogg` });

              models.Track.find({ path: `uploads/${root.getAgentDirectory()}/root1.ogg`}).then(tracks => {
                expect(tracks.length).toEqual(1);
                expect(tracks[0].published).not.toEqual(null);

                browser.pressButton('button.publish-track[aria-label="Unpublish"]', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  models.Track.find({ path: `uploads/${root.getAgentDirectory()}/root1.ogg`}).then(tracks => {
                    expect(tracks.length).toEqual(1);
                    expect(tracks[0].published).toEqual(null);

                    done();
                  }).catch(err => {
                    done.fail(err);
                  });
                });
              }).catch(err => {
                done.fail(err);
              });
            });

            it('redirects to the referring page', done => {
              browser.clickLink(`a[href="/track/${root.getAgentDirectory()}"]`, err => {
                if (err) return done.fail(err);
                browser.assert.success();

                browser.pressButton('button.publish-track[aria-label="Unpublish"]', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  browser.assert.url({ pathname: `/track/${root.getAgentDirectory()}` });
                  done();
                });
              });
            });
          });
        });

        describe('non-sudo resource', () => {
          beforeEach(done => {
            browser.clickLink(lanny.getAgentDirectory(), err => {
              if (err) return done.fail(err);
              browser.clickLink('lanny1.ogg', (err) => {
                if (err) return done.fail(err);
                browser.assert.success();
                done();
              });
            });
          });

          it('shows a publish button', () => {
            browser.assert.element('.publish-track-form');
          });

          it('updates the database record\'s published property', done => {
            models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
              expect(tracks.length).toEqual(1);
              expect(tracks[0].published).toEqual(null);

              browser.pressButton('button.publish-track[aria-label="Publish"]', err => {
                if (err) return done.fail(err);
                browser.assert.redirected();
                browser.assert.url({ path: `/track/${lanny.getAgentDirectory()}/lanny1.ogg` });

                models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
                  expect(tracks.length).toEqual(1);
                  expect(tracks[0].published instanceof Date).toBe(true);

                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
            }).catch(err => {
              done.fail(err);
            });
          });

          it('redirects to the referer page', done => {
            browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}/lanny1.ogg` });
            browser.pressButton('button.publish-track[aria-label="Publish"]', err => {
              if (err) return done.fail(err);
              browser.assert.success();

              browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}/lanny1.ogg` });
              done();
            });
          });
        });
      });
    });
  });

  describe('from index view', () => {

    describe('authenticated', () => {

      let root;
      beforeEach(done => {
        expect(process.env.SUDO).toBeDefined();
        stubAuth0Sessions(process.env.SUDO, DOMAIN, err => {
          if (err) return done.fail(err);

          browser.clickLink('Login', err => {
            if (err) done.fail(err);
            browser.assert.success();

            browser.clickLink('Admin', function(err) {
              if (err) return done.fail(err);
              browser.assert.success();

              models.Agent.findOne({ email: process.env.SUDO }).then(results => {
                root = results;

                mockAndUnmock({
                  [`uploads/${agent.getAgentDirectory()}`]: {
                    'track1.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'track2.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'track3.ogg': fs.readFileSync('spec/files/troll.ogg'),
                  },
                  [`uploads/${lanny.getAgentDirectory()}`]: {
                    'lanny1.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'lanny2.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'lanny3.ogg': fs.readFileSync('spec/files/troll.ogg'),
                  },
                  [`uploads/${root.getAgentDirectory()}`]: {
                    'root1.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'root2.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'root3.ogg': fs.readFileSync('spec/files/troll.ogg'),
                  },
                  'public/tracks/uploads': {}
                });

                const tracks = [
                  { path: `uploads/${agent.getAgentDirectory()}/track1.ogg`, recordist: agent._id },
                  { path: `uploads/${agent.getAgentDirectory()}/track2.ogg`, recordist: agent._id },
                  { path: `uploads/${agent.getAgentDirectory()}/track3.ogg`, recordist: agent._id },
                  { path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`, recordist: lanny._id },
                  { path: `uploads/${lanny.getAgentDirectory()}/lanny2.ogg`, recordist: lanny._id },
                  { path: `uploads/${lanny.getAgentDirectory()}/lanny3.ogg`, recordist: lanny._id },
                  { path: `uploads/${root.getAgentDirectory()}/root1.ogg`, recordist: root._id },
                  { path: `uploads/${root.getAgentDirectory()}/root2.ogg`, recordist: root._id },
                  { path: `uploads/${root.getAgentDirectory()}/root3.ogg`, recordist: root._id },
                ];
                models.Track.create(tracks).then(results => {

                  browser.clickLink('Tracks', err => {
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
          });
        });
      });

      afterEach(() => {
        mock.restore();
      });

      it('renders forms to allow root to publish tracks', () => {
        browser.assert.elements('.publish-track-form', 3);
        browser.assert.element(`form[action="/track/${root.getAgentDirectory()}/root1.ogg"][method="post"]`);
        browser.assert.element(`form[action="/track/${root.getAgentDirectory()}/root2.ogg"][method="post"]`);
        browser.assert.element(`form[action="/track/${root.getAgentDirectory()}/root3.ogg"][method="post"]`);
      });

      describe('publishing', () => {
        describe('root\'s own resource', () => {
          beforeEach(() => {
            browser.assert.elements('.publish-track-form', 3);
          });

          it('redirects to referer if the publish is successful', done => {
            //
            // Careful here... this is pressing the first button. There are three Publish buttons
            //
            // If this flakes out somehow, remember this:
            //   browser.document.forms[0].submit();
            //
            // 2020-10-2 https://stackoverflow.com/a/40264336/1356582
            //

            browser.pressButton('button.publish-track[aria-label="Publish"]', err => {
              if (err) return done.fail(err);

              browser.assert.success();
              browser.assert.text('.alert.alert-success', 'Track published');
              browser.assert.url({ pathname: `/track/${root.getAgentDirectory()}` });
              done();
            });
          });

          it('set database record to published', done => {
            models.Track.find({ path: `uploads/${root.getAgentDirectory()}/root1.ogg`}).then(tracks => {
              expect(tracks.length).toEqual(1);
              expect(tracks[0].published).toEqual(null);

              browser.pressButton(`form[action="/track/${root.getAgentDirectory()}/root1.ogg"] button.publish-track[aria-label="Publish"]`, err => {
                if (err) return done.fail(err);
                browser.assert.success();

                models.Track.find({ path: `uploads/${root.getAgentDirectory()}/root1.ogg`}).then(tracks => {
                  expect(tracks.length).toEqual(1);
                  expect(tracks[0].published instanceof Date).toBe(true);

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

        describe('non-sudo resource', () => {
          beforeEach(done => {
            browser.clickLink('Admin', err => {
              if (err) return done.fail(err);
              browser.clickLink(lanny.getAgentDirectory(), err => {
                if (err) return done.fail(err);
                browser.assert.url({ path: `/track/${lanny.getAgentDirectory()}` });
                done();
              });
            });
          });

          it('shows publish buttons', () => {
            browser.assert.elements('.publish-track-form', 3);
          });

          it('lands in the right spot', done => {
            browser.pressButton('button.publish-track[aria-label="Publish"]', err => {
              if (err) return done.fail(err);
              browser.assert.redirected();
              browser.assert.url({ path: `/track/${lanny.getAgentDirectory()}` });
              done();
            });
          });

          it('displays a friendly message', done => {
            browser.pressButton('button.publish-track[aria-label="Publish"]', err => {
              if (err) return done.fail(err);

              browser.assert.text('.alert.alert-success', 'Track published');
              done();
            });
          });

          it('sets the track to published in the database', done => {
            models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
              expect(tracks.length).toEqual(1);
              expect(tracks[0].published).toEqual(null);

              browser.pressButton(`form[action="/track/${lanny.getAgentDirectory()}/lanny1.ogg"] button.publish-track[aria-label="Publish"]`, err => {
                if (err) return done.fail(err);

                models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
                  expect(tracks.length).toEqual(1);
                  expect(tracks[0].published instanceof Date).toBe(true);

                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
            }).catch(err => {
              done.fail(err);
            });
          });

          describe('unpublishing', () => {
            let track;
            beforeEach(done => {
              models.Track.find({ recordist: lanny._id }).sort({updatedAt: 'desc'}).then(tracks => {
                track = tracks[0];
                browser.pressButton('button.publish-track[aria-label="Publish"]', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();
                  done();
                });
              });
            });

            it('shows an unpublish button on the agent\'s audio roll', () => {
              browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}` });
              browser.assert.element(`form[action="/${track.path.replace('uploads', 'track')}"] button.publish-track[aria-label="Unpublish"]`);
            });

            it('shows an unpublish button on the track\'s show view', done => {
              browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}` });
              browser.clickLink(`a[href="/${track.path.replace('uploads', 'track')}"]`, err => {
                if (err) return done.fail(err);
                browser.assert.success();
                browser.assert.element(`form[action="/${track.path.replace('uploads', 'track')}"] button.publish-track[aria-label="Unpublish"]`);
                done();
              });
            });

            it('sets the track\'s published property to null in the database', done => {
              models.Track.find({ _id: track._id}).then(tracks => {
                expect(tracks.length).toEqual(1);
                expect(tracks[0].published).not.toEqual(null);

                browser.pressButton('button.publish-track[aria-label="Unpublish"]', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  models.Track.find({ _id: track._id}).then(tracks => {
                    expect(tracks.length).toEqual(1);
                    expect(tracks[0].published).toEqual(null);

                    done();
                  }).catch(err => {
                    done.fail(err);
                  });
                });
              }).catch(err => {
                done.fail(err);
              });
            });

            it('redirects to the referring page', done => {
              browser.visit(`/track/${lanny.getAgentDirectory()}`, err => {
                if (err) return done.fail(err);
                browser.assert.success();

                browser.pressButton('button.publish-track[aria-label="Unpublish"]', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}` });
                  browser.assert.text('.alert.alert-success', 'Track unpublished');
                  done();
                });
              });
            });
          });
        });
      });
    });
  });
});
