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

      it('renders a form to allow an agent to publish a track', done => {
        browser.clickLink(`a[href="/track/${agent.getAgentDirectory()}/track1.ogg"]`, err => {
          if (err) return done.fail(err);
          browser.assert.success();
          browser.assert.element('.publish-track-form');
          browser.assert.element(`form[action="/track/${agent.getAgentDirectory()}/track1.ogg"][method="post"]`);
          done();
        });
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

          it('redirects to referring page if the publish is successful', done => {
            browser.pressButton('button.publish-track[aria-label="Publish"]', err => {
              if (err) return done.fail(err);

              browser.assert.success();
              browser.assert.text('.alert.alert-success', 'Track published');
              browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}/track1.ogg` });
              done();
            });
          });

          it('does not delete the track from the agent\'s directory', done => {
            fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
              if (err) return done.fail(err);
              expect(files.length).toEqual(3);
              expect(files.includes('track1.ogg')).toBe(true);

              browser.pressButton('button.publish-track[aria-label="Publish"]', function(err) {
                if (err) return done.fail(err);
                browser.assert.success();

                fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
                  if (err) return done.fail(err);
                  expect(files.length).toEqual(3);
                  expect(files.includes('track1.ogg')).toBe(true);

                  done();
                });
              });
            });
          });

          it('does not add the track to the public/tracks/uploads directory', function(done) {
            fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
              if (err) return done.fail(err);
              expect(files.length).toEqual(3);
              expect(files.includes('track1.ogg')).toBe(true);

              browser.pressButton('button.publish-track[aria-label="Publish"]', function(err) {
                if (err) return done.fail(err);
                browser.assert.success();

                fs.readdir(`public/tracks/uploads`, (err, files) => {
                  if (err) return done.fail(err);
                  expect(files.length).toEqual(0);
                  expect(files.includes('track1.ogg')).toBe(false);

                  done();
                });
              });
            });
          });

          it('does not point the database path to the public/tracks/uploads directory', done => {
            models.Track.find({ path: `public/tracks/uploads/track1.ogg`}).then(tracks => {
              expect(tracks.length).toEqual(0);

              models.Track.find({ path: `uploads/${agent.getAgentDirectory()}/track1.ogg`}).then(tracks => {
                expect(tracks.length).toEqual(1);
                expect(tracks[0].published).toEqual(null);

                browser.pressButton('button.publish-track[aria-label="Publish"]', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  models.Track.find({ path: `uploads/${agent.getAgentDirectory()}/track1.ogg`}).then(tracks => {
                    expect(tracks.length).toEqual(1);
                    expect(tracks[0].published instanceof Date).toBe(true);

                    models.Track.find({ path: `public/tracks/uploads/track1.ogg`}).then(tracks => {
                      expect(tracks.length).toEqual(0);

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

            it('shows an unpublish button on the agent\'s audio roll', done => {
              browser.clickLink(`a[href="/track/${agent.getAgentDirectory()}"]`, err => {
                if (err) return done.fail(err);
                browser.assert.success();

                browser.assert.element(`form[action="/track/${agent.getAgentDirectory()}/track1.ogg"] button.publish-track[aria-label="Unpublish"]`);
                done();
              });
            });

            it('shows an unpublish button on the track\'s show view', () => {
              browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}/track1.ogg` });
              browser.assert.element('.publish-track-form button.publish-track[aria-label="Unpublish"]');
            });

            it('sets the track\'s published property to null in the database', done => {
              browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}/track1.ogg` });

              models.Track.find({ path: `uploads/${agent.getAgentDirectory()}/track1.ogg`}).then(tracks => {
                expect(tracks.length).toEqual(1);
                expect(tracks[0].published).not.toEqual(null);

                browser.pressButton('button.publish-track[aria-label="Unpublish"]', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

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

            it('redirects to the referring page', done => {
              browser.clickLink(`a[href="/track/${agent.getAgentDirectory()}"]`, err => {
                if (err) return done.fail(err);
                browser.assert.success();

                browser.pressButton('button.publish-track[aria-label="Unpublish"]', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}` });
                  done();
                });
              });
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

          it('does not remove the track from the agent\'s directory', done => {
            fs.readdir(`uploads/${lanny.getAgentDirectory()}`, (err, files) => {
              if (err) return done.fail(err);
              expect(files.length).toEqual(3);
              expect(files.includes('lanny1.ogg')).toBe(true);

              request(app)
                .post(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`)
                .set('Cookie', browser.cookies)
                .end((err, res) => {
                  if (err) return done.fail(err);
                  expect(res.status).toEqual(302);
                  expect(res.header.location).toEqual(`/track/${lanny.getAgentDirectory()}`);

                  fs.readdir(`uploads/${lanny.getAgentDirectory()}`, (err, files) => {
                    if (err) return done.fail(err);
                    expect(files.length).toEqual(3);
                    expect(files.includes('lanny1.ogg')).toBe(true);

                    fs.readdir(`public/tracks/uploads`, (err, files) => {
                      if (err) return done.fail(err);
                      expect(files.length).toEqual(0);
                      expect(files.includes('track1.ogg')).toBe(false);

                      done();
                    });
                  });
                });
            });
          });

          it('does not modify the database record\'s path property', done => {
            models.Track.find({ path: `public/tracks/uploads/lanny1.ogg`}).then(tracks => {
              expect(tracks.length).toEqual(0);

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

                      models.Track.find({ path: `public/tracks/uploads/lanny1.ogg`}).then(tracks => {
                        expect(tracks.length).toEqual(0);

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

          it('does not touch the track on the file system', function(done) {
            fs.readdir(`uploads/${troy.getAgentDirectory()}`, (err, files) => {
              if (err) return done.fail(err);
              expect(files.length).toEqual(1);
              expect(files.includes('troy1.ogg')).toBe(true);

              request(app)
                .post(`/track/${troy.getAgentDirectory()}/troy1.ogg`)
                .set('Cookie', browser.cookies)
                .end(function(err, res) {
                  if (err) return done.fail(err);
                  expect(res.status).toEqual(302);
                  expect(res.header.location).toEqual('/');

                  fs.readdir(`uploads/${troy.getAgentDirectory()}`, (err, files) => {
                    if (err) return done.fail(err);
                    expect(files.length).toEqual(1);
                    expect(files.includes('troy1.ogg')).toBe(true);

                    fs.readdir(`public/tracks/uploads`, (err, files) => {
                      if (err) return done.fail(err);
                      expect(files.length).toEqual(0);
                      expect(files.includes('troy1.ogg')).toBe(false);

                      done();
                    });
                  });
                });
            });
          });

          it('does not modify the database record\'s path property', done => {
            models.Track.find({ path: `public/tracks/uploads/troy1.ogg`}).then(tracks => {
              expect(tracks.length).toEqual(0);

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

                      models.Track.find({ path: `public/tracks/uploads/troy1.ogg`}).then(tracks => {
                        expect(tracks.length).toEqual(0);

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
            }).catch(err => {
              done.fail(err);
            });
          });
        });

        describe('sudo mode', () => {

          afterEach(() => {
            delete process.env.SUDO;
          });

          describe('set', () => {
            describe('non sudo agent', () => {

              beforeEach(() => {
                process.env.SUDO = 'lanny@example.com';
                expect(process.env.SUDO).not.toEqual(agent.email);
              });

              it('doesn\'t render the Publish button', done => {
                browser.clickLink(`a[href="/track/${agent.getAgentDirectory()}/track1.ogg"]`, (err) => {
                  if (err) return done.fail(err);

                  browser.assert.success();
                  browser.assert.elements('.publish-track-form', 0);
                  done();
                });
              });

              it('redirects to the original directory', done => {
                request(app)
                  .post(`/track/${agent.getAgentDirectory()}/track2.ogg`)
                  .set('Cookie', browser.cookies)
                  .expect(302)
                  .end((err, res) => {
                    if (err) return done.fail(err);

                    expect(res.header.location).toEqual(`/track/${agent.getAgentDirectory()}/track2.ogg`);
                    done();
                  });
              });

              it('does not modify the database record\'s path property', done => {
                models.Track.find({ path: `public/tracks/uploads/track2.ogg`}).then(tracks => {
                  expect(tracks.length).toEqual(0);

                  models.Track.find({ path: `uploads/${agent.getAgentDirectory()}/track2.ogg`}).then(tracks => {
                    expect(tracks.length).toEqual(1);
                    expect(tracks[0].published).toEqual(null);

                    request(app)
                      .post(`/track/${agent.getAgentDirectory()}/track2.ogg`)
                      .set('Cookie', browser.cookies)
                      .expect(302)
                      .end(function(err, res) {
                        if (err) return done.fail(err);

                        models.Track.find({ path: `uploads/${agent.getAgentDirectory()}/track2.ogg`}).then(tracks => {
                          expect(tracks.length).toEqual(1);
                          expect(tracks[0].published).toEqual(null);

                          models.Track.find({ path: `public/tracks/uploads/track2.ogg`}).then(tracks => {
                            expect(tracks.length).toEqual(0);

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
                }).catch(err => {
                  done.fail(err);
                });
              });
            });

            describe('sudo agent', () => {

              beforeEach(done => {
                process.env.SUDO = agent.email;
                browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, (err) => {
                  if (err) return done.fail(err);
                  browser.assert.success();
                  browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}/lanny1.ogg` });
                  done();
                });
              });

              it('renders the Publish button', () => {
                browser.assert.element('.publish-track-form');
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

              it('does not point the database path to the public/tracks/uploads directory', done => {
                models.Track.find({ path: `public/tracks/uploads/lanny1.ogg`}).then(tracks => {
                  expect(tracks.length).toEqual(0);

                  models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
                    expect(tracks.length).toEqual(1);
                    expect(tracks[0].published).toEqual(null);

                    browser.pressButton('button.publish-track[aria-label="Publish"]', err => {
                      if (err) return done.fail(err);
                      browser.assert.success();

                      models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
                        expect(tracks.length).toEqual(1);
                        expect(tracks[0].published instanceof Date).toBe(true);

                        models.Track.find({ path: `public/tracks/uploads/lanny1.ogg`}).then(tracks => {
                          expect(tracks.length).toEqual(0);

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
                }).catch(err => {
                  done.fail(err);
                });
              });
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

      it('renders forms to allow an agent to publish a track', () => {
        browser.assert.elements('.publish-track-form', 3);
        browser.assert.element(`form[action="/track/${agent.getAgentDirectory()}/track1.ogg"][method="post"]`);
        browser.assert.element(`form[action="/track/${agent.getAgentDirectory()}/track2.ogg"][method="post"]`);
        browser.assert.element(`form[action="/track/${agent.getAgentDirectory()}/track3.ogg"][method="post"]`);
      });

      describe('publishing', () => {
        describe('owner resource', () => {
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
              browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}` });
              done();
            });
          });

          it('does not delete the track from the agent\'s directory', done => {
            models.Track.find({ recordist: agent._id }).limit(1).sort({ updatedAt: 'desc' }).then(mostRecentTrack => {
              expect(mostRecentTrack.length).toEqual(1);

              let filename = mostRecentTrack[0].path.split('/');
              filename = filename[filename.length - 1];

              fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
                if (err) return done.fail(err);
                expect(files.length).toEqual(3);
                expect(files.includes(filename)).toBe(true);

                // Cf., Publish notes above
                browser.pressButton('button.publish-track[aria-label="Publish"]', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
                    if (err) return done.fail(err);
                    expect(files.length).toEqual(3);
                    expect(files.includes(filename)).toBe(true);

                    done();
                  });
                });
              });
            }).catch(err => {
              done.fail(err);
            });
          });

          it('does not add the track to the public/tracks/uploads directory', function(done) {
            models.Track.find({ recordist: agent._id }).limit(1).sort({ updatedAt: 'desc' }).then(mostRecentTrack => {
              expect(mostRecentTrack.length).toEqual(1);

              let filename = mostRecentTrack[0].path.split('/');
              filename = filename[filename.length - 1];

              fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
                if (err) return done.fail(err);
                expect(files.length).toEqual(3);
                expect(files.includes(filename)).toBe(true);

                // Cf., Publish notes above
                browser.pressButton('button.publish-track[aria-label="Publish"]', function(err) {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  fs.readdir(`public/tracks/uploads`, (err, files) => {
                    if (err) return done.fail(err);
                    expect(files.length).toEqual(0);
                    expect(files.includes(filename)).toBe(false);

                    done();
                  });
                });
              });
            }).catch(err => {
              done.fail(err);
            });
          });

          it('does not point the database path to the public/tracks/uploads directory', done => {
            models.Track.find({ recordist: agent._id }).limit(1).sort({ updatedAt: 'desc' }).then(mostRecentTrack => {
              expect(mostRecentTrack.length).toEqual(1);

              let filename = mostRecentTrack[0].path.split('/');
              filename = filename[filename.length - 1];

              models.Track.find({ path: `public/tracks/uploads/${filename}`}).then(tracks => {
                expect(tracks.length).toEqual(0);

                models.Track.find({ path: `uploads/${agent.getAgentDirectory()}/${filename}`}).then(tracks => {
                  expect(tracks.length).toEqual(1);
                  expect(tracks[0].published).toEqual(null);

                  browser.pressButton('button.publish-track[aria-label="Publish"]', err => {
                    if (err) return done.fail(err);
                    browser.assert.success();

                    models.Track.find({ path: `uploads/${agent.getAgentDirectory()}/${filename}`}).then(tracks => {
                      expect(tracks.length).toEqual(1);
                      expect(tracks[0].published instanceof Date).toBe(true);

                      models.Track.find({ path: `public/tracks/uploads/${filename}`}).then(tracks => {
                        expect(tracks.length).toEqual(0);

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
              }).catch(err => {
                done.fail(err);
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

          it('does not remove the track from the agent\'s directory', function(done) {
            fs.readdir(`uploads/${lanny.getAgentDirectory()}`, (err, files) => {
              if (err) return done.fail(err);
              expect(files.length).toEqual(3);
              expect(files.includes('lanny1.ogg')).toBe(true);
              expect(files.includes('lanny2.ogg')).toBe(true);
              expect(files.includes('lanny3.ogg')).toBe(true);

              request(app)
                .post(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`)
                .set('Cookie', browser.cookies)
                .end(function(err, res) {
                  if (err) return done.fail(err);
                  expect(res.status).toEqual(302);
                  expect(res.header.location).toEqual(`/track/${lanny.getAgentDirectory()}`);

                  fs.readdir(`uploads/${lanny.getAgentDirectory()}`, (err, files) => {
                    if (err) return done.fail(err);
                    expect(files.length).toEqual(3);
                    expect(files.includes('lanny1.ogg')).toBe(true);
                    expect(files.includes('lanny2.ogg')).toBe(true);
                    expect(files.includes('lanny3.ogg')).toBe(true);

                    fs.readdir(`public/tracks/uploads`, (err, files) => {
                      if (err) return done.fail(err);
                      expect(files.length).toEqual(0);
                      expect(files.includes('track1.ogg')).toBe(false);
                      expect(files.includes('track2.ogg')).toBe(false);
                      expect(files.includes('track3.ogg')).toBe(false);

                      done();
                    });
                  });
                });
            });
          });

          it('does not modify the database record\'s path property', done => {
            models.Track.find({ path: `public/tracks/uploads/lanny1.ogg`}).then(tracks => {
              expect(tracks.length).toEqual(0);

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

                      models.Track.find({ path: `public/tracks/uploads/lanny1.ogg`}).then(tracks => {
                        expect(tracks.length).toEqual(0);

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
            }).catch(err => {
              done.fail(err);
            });
          });
        });

        describe('sudo mode', () => {

          afterEach(() => {
            delete process.env.SUDO;
          });

          describe('set', () => {
            describe('non sudo agent', () => {

              beforeEach(() => {
                process.env.SUDO = 'lanny@example.com';
                expect(process.env.SUDO).not.toEqual(agent.email);
              });

              it('doesn\'t render the Publish buttons', done => {
                browser.visit(`/track/${agent.getAgentDirectory()}`, (err) => {
                  browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}` });
                  browser.assert.elements('.publish-track-form', 0);
                  done();
                });
              });
            });

            describe('sudo agent', () => {

              beforeEach(done => {
                process.env.SUDO = agent.email;
                browser.visit(`/track/${lanny.getAgentDirectory()}`, err => {
                  if (err) return done.fail(err);
                  browser.assert.success();
                  browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}` });
                  done();
                });
              });

              it('renders the Publish button', () => {
                browser.assert.success();
                browser.assert.elements('.publish-track-form', 3);
              });

              it('does not point the database path to the public/tracks/uploads directory', done => {
                models.Track.find({ recordist: lanny._id }).limit(1).sort({ updatedAt: 'desc' }).then(mostRecentTrack => {
                  expect(mostRecentTrack.length).toEqual(1);

                  let filename = mostRecentTrack[0].path.split('/');
                  filename = filename[filename.length - 1];

                  models.Track.find({ path: `public/tracks/uploads/${filename}`}).then(tracks => {
                    expect(tracks.length).toEqual(0);

                    models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/${filename}`}).then(tracks => {
                      expect(tracks.length).toEqual(1);
                      expect(tracks[0].published).toEqual(null);

                      browser.pressButton('button.publish-track[aria-label="Publish"]', err => {
                        if (err) return done.fail(err);
                        browser.assert.success();

                        models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/${filename}`}).then(tracks => {
                          expect(tracks.length).toEqual(1);
                          expect(tracks[0].published instanceof Date).toBe(true);

                          models.Track.find({ path: `public/tracks/uploads/${filename}`}).then(tracks => {
                            expect(tracks.length).toEqual(0);

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
                  }).catch(err => {
                    done.fail(err);
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
  });
});
