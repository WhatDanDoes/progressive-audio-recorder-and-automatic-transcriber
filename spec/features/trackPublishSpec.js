'use strict';

const fixtures = require('pow-mongoose-fixtures');
const models = require('../../models');

const app = require('../../app');
const request = require('supertest');

const fs = require('fs');
const mkdirp = require('mkdirp');

const Browser = require('zombie');
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;
const DOMAIN = 'example.com';
Browser.localhost(DOMAIN, PORT);

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


// For when system resources are scarce
jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

describe('Publishing a track', () => {

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

  describe('from show view', () => {

    describe('unauthenticated', () => {
      it('does not allow publishing a track', done => {
        request(app)
          .post(`/track/${agent.getAgentDirectory()}/track2.ogg`)
          .end((err, res) => {
            if (err) return done.fail(err);
            expect(res.status).toEqual(302);
            expect(res.header.location).toEqual('/');
            done();
          });
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
            [`uploads/${lanny.getAgentDirectory()}`]: {
              'lanny1.ogg': fs.readFileSync('spec/files/troll.ogg'),
              'lanny2.ogg': fs.readFileSync('spec/files/troll.ogg'),
              'lanny3.ogg': fs.readFileSync('spec/files/troll.ogg'),
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
          ];
          models.Track.create(tracks).then(results => {

            browser.clickLink('Login', err => {
              if (err) done.fail(err);
              browser.assert.success();
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

      describe('publishing', () => {

        describe('owner resource', () => {

          beforeEach(done => {
            browser.clickLink(`a[href="/track/${agent.getAgentDirectory()}/track1.ogg"]`, err => {
              if (err) return done.fail(err);
              browser.assert.success();
              done();
            });
          });

          it('does not allow an ordinary agent to publish a track', () => {
            browser.assert.elements('.publish-track-form', 0);
          });

          it('does not set the database record to published', done => {
            models.Track.find({ path: `uploads/${agent.getAgentDirectory()}/track1.ogg`}).then(tracks => {
              expect(tracks.length).toEqual(1);
              expect(tracks[0].published).toEqual(null);

              request(app)
                .post(`/track/${agent.getAgentDirectory()}/track1.ogg`)
                .set('Cookie', browser.cookies)
                .expect(302)
                .end((err, res) => {
                  if (err) return done.fail(err);

                  models.Track.find({ path: `uploads/${agent.getAgentDirectory()}/track1.ogg`}).then(tracks => {
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
        });

        describe('readable resource', () => {
          beforeEach(done => {
            browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, (err) => {
              if (err) return done.fail(err);
              browser.assert.success();
              done();
            });
          });

          it('does not show a publish button', () => {
            browser.assert.elements('.publish-track-form', 0);
          });

          it('does not set the database record to published', done => {
            models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
              expect(tracks.length).toEqual(1);
              expect(tracks[0].published).toEqual(null);

              request(app)
                .post(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`)
                .set('Cookie', browser.cookies)
                .expect(302)
                .end((err, res) => {
                  if (err) return done.fail(err);

                  models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
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
        });

        describe('unauthorized resource', function() {
          let troy;
          beforeEach(function(done) {
            models.Agent.findOne({ email: 'troy@example.com' }).then(function(result) {
              troy = result;

              expect(agent.canRead.length).toEqual(1);
              expect(agent.canRead[0]).not.toEqual(troy._id);

              mkdirp(`uploads/${troy.getAgentDirectory()}`, (err) => {
                fs.writeFileSync(`uploads/${troy.getAgentDirectory()}/troy1.ogg`, fs.readFileSync('spec/files/troll.ogg'));

                const tracks = [
                  { path: `uploads/${troy.getAgentDirectory()}/troy1.ogg`, recordist: troy._id },
                ];
                models.Track.create(tracks).then(results => {

                  browser.visit(`/track/${troy.getAgentDirectory()}/troy1.ogg`, function(err) {
                    if (err) return done.fail(err);
                    done();
                  });
                }).catch(err => {
                  done.fail(err);
                });
              });
            }).catch(function(error) {
              done.fail(error);
            });
          });

          it('redirects home', () => {
            browser.assert.redirected();
            browser.assert.url({ pathname: '/'});
            browser.assert.text('.alert.alert-danger', 'You are not authorized to access that resource');
          });

          it('does not modify the database record', done => {
            models.Track.find({ path: `uploads/${troy.getAgentDirectory()}/troy1.ogg`}).then(tracks => {
              expect(tracks.length).toEqual(1);
              expect(tracks[0].published).toEqual(null);

              request(app)
                .post(`/track/${troy.getAgentDirectory()}/troy1.ogg`)
                .set('Cookie', browser.cookies)
                .expect(302)
                .end(function(err, res) {
                  if (err) return done.fail(err);

                  models.Track.find({ path: `uploads/${troy.getAgentDirectory()}/troy1.ogg`}).then(tracks => {
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
        });
      });
    });
  });

  describe('from index view', () => {

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
            [`uploads/${lanny.getAgentDirectory()}`]: {
              'lanny1.ogg': fs.readFileSync('spec/files/troll.ogg'),
              'lanny2.ogg': fs.readFileSync('spec/files/troll.ogg'),
              'lanny3.ogg': fs.readFileSync('spec/files/troll.ogg'),
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

      describe('publishing', () => {

        describe('owner resource', () => {

          it('renders forms to allow an agent to publish a track', () => {
            browser.assert.elements('.publish-track-form', 0);
          });

          it('does not change the database', done => {
            models.Track.find({ path: `uploads/${agent.getAgentDirectory()}/track1.ogg`}).then(tracks => {
              expect(tracks.length).toEqual(1);
              expect(tracks[0].published).toEqual(null);

              request(app)
                .post(`/track/${agent.getAgentDirectory()}/track1.ogg`)
                .set('Cookie', browser.cookies)
                .expect(302)
                .end(function(err, res) {
                  if (err) return done.fail(err);

                  models.Track.find({ path: `uploads/${agent.getAgentDirectory()}/track1.ogg`}).then(tracks => {
                    expect(tracks.length).toEqual(1);
                    expect(tracks[0].published).toEqual(null);
                    expect(tracks[0].published instanceof Date).toBe(false);
  
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

        describe('readable resource', () => {
          beforeEach(done => {
            browser.visit(`/track/${lanny.getAgentDirectory()}`, (err) => {
              if (err) return done.fail(err);
              browser.assert.success();
              done();
            });
          });

          it('does not show a publish button', () => {
            browser.assert.elements('.publish-track-form', 0);
          });

          it('does not modify the database record', done => {
            models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
              expect(tracks.length).toEqual(1);
              expect(tracks[0].published).toEqual(null);

              request(app)
                .post(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`)
                .set('Cookie', browser.cookies)
                .expect(302)
                .end(function(err, res) {
                  if (err) return done.fail(err);

                  models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
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
        });
      });
    });
  });
});
