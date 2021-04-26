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

describe('Deleting an track', () => {

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

  describe('from show view', function() {

    describe('unauthenticated', function() {
      it('does not allow deleting an track', function(done) {
        request(app)
          .delete(`/track/${agent.getAgentDirectory()}/track2.ogg`)
          .end(function(err, res) {
            if (err) return done.fail(err);
            expect(res.status).toEqual(302);
            expect(res.header.location).toEqual('/');
            done();
          });
      });
    });

    describe('authenticated', function() {
      beforeEach(done => {

        stubAuth0Sessions(agent.email, DOMAIN, err => {
          if (err) done.fail(err);

          // Don't mock too soon. The stub needs some files
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
              if (err) return done.fail(err);
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

      it('renders a form to allow an agent to delete an track', function(done) {
        browser.clickLink(`a[href="/track/${agent.getAgentDirectory()}/track1.ogg"]`, (err) => {
          if (err) return done.fail(err);
          browser.assert.success();
          browser.assert.element('.delete-track-form');
          browser.assert.element(`form[action="/track/${agent.getAgentDirectory()}/track1.ogg?_method=DELETE"]`);
          done();
        });
      });

      describe('deleting', function() {
        describe('owner resource', function() {
          beforeEach(function(done) {
            browser.clickLink(`a[href="/track/${agent.getAgentDirectory()}/track1.ogg"]`, (err) => {
              if (err) return done.fail(err);
              browser.assert.success();
              done();
            });
          });

          it('redirects to the origin album if the delete is successful', function(done) {
            browser.pressButton('Delete', function(err) {
              if (err) return done.fail(err);

              browser.assert.success();
              browser.assert.text('.alert.alert-info', 'Track deleted');
              browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}` });
              done();
            });
          });

          it('deletes the track from the file system', function(done) {
            fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
              if (err) return done.fail(err);
              expect(files.length).toEqual(3);
              expect(files.includes('track1.ogg')).toBe(true);

              browser.pressButton('Delete', function(err) {
                if (err) return done.fail(err);
                browser.assert.success();

                fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
                  if (err) return done.fail(err);
                  expect(files.length).toEqual(2);
                  expect(files.includes('track1.ogg')).toBe(false);

                  done();
                });
              });
            });
          });

          it('deletes the track from the database', function(done) {
            models.Track.find({ path: `uploads/${agent.getAgentDirectory()}/track1.ogg` }).then(tracks => {
              expect(tracks.length).toEqual(1);

              browser.pressButton('Delete', function(err) {
                if (err) return done.fail(err);
                browser.assert.success();

                models.Track.find({ path: `uploads/${agent.getAgentDirectory()}/track1.ogg` }).then(tracks => {
                  expect(tracks.length).toEqual(0);

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

        describe('readable resource', function() {
          beforeEach(function(done) {
            browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, (err) => {
              if (err) return done.fail(err);
              browser.assert.success();
              done();
            });
          });

          it('does not show a delete button', () => {
            browser.assert.elements('.delete-track-form', 0);
          });

          it('does not delete the track from the file system', function(done) {
            fs.readdir(`uploads/${lanny.getAgentDirectory()}`, (err, files) => {
              if (err) return done.fail(err);
              expect(files.length).toEqual(3);
              expect(files.includes('lanny1.ogg')).toBe(true);

              request(app)
                .delete(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`)
                .set('Cookie', browser.cookies)
                .end((err, res) => {
                  if (err) return done.fail(err);
                  expect(res.status).toEqual(302);
                  expect(res.header.location).toEqual(`/track/${lanny.getAgentDirectory()}`);

                  fs.readdir(`uploads/${lanny.getAgentDirectory()}`, (err, files) => {
                    if (err) return done.fail(err);
                    expect(files.length).toEqual(3);
                    expect(files.includes('lanny1.ogg')).toBe(true);

                    done();
                  });
                });
            });
          });

          it('does not delete the track record from the database', done => {
            models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg` }).then(tracks => {
              expect(tracks.length).toEqual(1);

              request(app)
                .delete(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`)
                .set('Cookie', browser.cookies)
                .expect(302)
                .end((err, res) => {
                  if (err) return done.fail(err);

                  models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg` }).then(tracks => {
                    expect(tracks.length).toEqual(1);

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

          it('does not delete the track from the file system', function(done) {
            fs.readdir(`uploads/${troy.getAgentDirectory()}`, (err, files) => {
              if (err) return done.fail(err);
              expect(files.length).toEqual(1);
              expect(files.includes('troy1.ogg')).toBe(true);

              request(app)
                .delete(`/track/${troy.getAgentDirectory()}/troy1.ogg`)
                .set('Cookie', browser.cookies)
                .end(function(err, res) {
                  if (err) return done.fail(err);
                  expect(res.status).toEqual(302);
                  expect(res.header.location).toEqual('/');

                  fs.readdir(`uploads/${troy.getAgentDirectory()}`, (err, files) => {
                    if (err) return done.fail(err);
                    expect(files.length).toEqual(1);
                    expect(files.includes('troy1.ogg')).toBe(true);

                    done();
                  });
                });
            });
          });

          it('does not delete the track record from the database', done => {
            models.Track.find({ path: `uploads/${troy.getAgentDirectory()}/troy1.ogg` }).then(tracks => {
              expect(tracks.length).toEqual(1);

              request(app)
                .delete(`/track/${troy.getAgentDirectory()}/troy1.ogg`)
                .set('Cookie', browser.cookies)
                .expect(302)
                .end((err, res) => {
                  if (err) return done.fail(err);

                  models.Track.find({ path: `uploads/${troy.getAgentDirectory()}/troy1.ogg` }).then(tracks => {
                    expect(tracks.length).toEqual(1);

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

              it('renders the Delete buttons for the agent\'s own track', done => {
                browser.visit(`/track/${agent.getAgentDirectory()}/track1.ogg`, (err) => {
                  browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}/track1.ogg` });
                  browser.assert.elements('.delete-track-form', 1);
                  done();
                });
              });

              it('does not render the Delete buttons for the another agent\'s track', done => {
                browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, (err) => {
                  browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}/lanny1.ogg` });
                  browser.assert.elements('.delete-track-form', 0);
                  done();
                });
              });
            });

            describe('sudo agent', () => {

              beforeEach(done => {
                process.env.SUDO = agent.email;
                browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, err => {
                  if (err) return done.fail(err);
                  browser.assert.success();
                  browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}/lanny1.ogg` });
                  done();
                });
              });

              it('renders the Delete button', () => {
                browser.assert.success();
                browser.assert.elements('.delete-track-form', 1);
              });

              it('deletes the database record associated with the track', done => {
                models.Track.find({ path: `public/tracks/uploads/lanny1.ogg`}).then(tracks => {
                  expect(tracks.length).toEqual(0);

                  models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
                    expect(tracks.length).toEqual(1);

                    browser.pressButton('Delete', err => {
                      if (err) return done.fail(err);
                      browser.assert.success();

                      models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
                        expect(tracks.length).toEqual(0);

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

          // Don't mock too soon. The stub needs some files
          mockAndUnmock({
            [`uploads/${agent.getAgentDirectory()}`]: {
              'audio1.ogg': fs.readFileSync('spec/files/troll.ogg'),
              'audio2.ogg': fs.readFileSync('spec/files/troll.ogg'),
              'audio3.ogg': fs.readFileSync('spec/files/troll.ogg'),
            },
            [`uploads/${lanny.getAgentDirectory()}`]: {
              'lanny1.ogg': fs.readFileSync('spec/files/troll.ogg'),
              'lanny2.ogg': fs.readFileSync('spec/files/troll.ogg'),
              'lanny3.ogg': fs.readFileSync('spec/files/troll.ogg'),
            },
            'public/tracks/uploads': {}
          });

          const tracks = [
            { path: `uploads/${agent.getAgentDirectory()}/audio1.ogg`, recordist: agent._id },
            { path: `uploads/${agent.getAgentDirectory()}/audio2.ogg`, recordist: agent._id },
            { path: `uploads/${agent.getAgentDirectory()}/audio3.ogg`, recordist: agent._id },
            { path: `uploads/${lanny.getAgentDirectory()}/audio1.ogg`, recordist: lanny._id },
            { path: `uploads/${lanny.getAgentDirectory()}/audio2.ogg`, recordist: lanny._id },
            { path: `uploads/${lanny.getAgentDirectory()}/audio3.ogg`, recordist: lanny._id },
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

      it('renders a form to allow an agent to delete a track', () => {
        browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}` });
        browser.assert.elements('.delete-track-form', 3);
        browser.assert.element(`form[action="/track/${agent.getAgentDirectory()}/audio1.ogg?_method=DELETE"]`);
      });

      describe('deleting', () => {
        describe('owner resource', () => {
          beforeEach(() => {
            browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}` });
          });

          it('redirects to the origin album if the delete is successful', done => {
            browser.pressButton('Delete', err => {
              if (err) return done.fail(err);

              browser.assert.success();
              browser.assert.text('.alert.alert-info', 'Track deleted');
              browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}` });
              done();
            });
          });

          it('deletes the track from the file system', done => {
            models.Track.find({ recordist: agent._id, published: null}).limit(1).sort({ updatedAt: 'desc' }).then(mostRecentTrack => {
              expect(mostRecentTrack.length).toEqual(1);

              let filename = mostRecentTrack[0].path.split('/');
              filename = filename[filename.length - 1];

              fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
                if (err) return done.fail(err);
                expect(files.length).toEqual(3);
                expect(files.includes(filename)).toBe(true);

                browser.pressButton('Delete', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
                    if (err) return done.fail(err);
                    expect(files.length).toEqual(2);
                    expect(files.includes(filename)).toBe(false);

                    done();
                  });
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

          it('does not show a delete button', () => {
            browser.assert.elements('.delete-track-form', 0);
          });
        });

        describe('unauthorized resource', () => {
          let troy;
          beforeEach(done => {
            models.Agent.findOne({ email: 'troy@example.com' }).then(result => {
              troy = result;

              expect(agent.canRead.length).toEqual(1);
              expect(agent.canRead[0]).not.toEqual(troy._id);

              browser.visit(`/track/${troy.getAgentDirectory()}`, err => {
                if (err) return done.fail(err);
                done();
              });
            }).catch(error => {
              done.fail(error);
            });
          });

          it('redirects home', () => {
            browser.assert.redirected();
            browser.assert.url({ pathname: '/'});
            browser.assert.text('.alert.alert-danger', 'You are not authorized to access that resource');
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

              it('renders the Delete buttons for the agent\'s own tracks', done => {
                browser.visit(`/track/${agent.getAgentDirectory()}`, (err) => {
                  browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}` });
                  browser.assert.elements('.delete-track-form', 3);
                  done();
                });
              });

              it('does not render the Delete buttons for the another agent\'s tracks', done => {
                browser.visit(`/track/${lanny.getAgentDirectory()}`, (err) => {
                  browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}` });
                  browser.assert.elements('.delete-track-form', 0);
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
                browser.assert.elements('.delete-track-form', 3);
              });

              it('points the database path to the public/tracks/uploads directory', done => {
                models.Track.find({ recordist: lanny._id, published: { '$ne': null }}).then(tracks => {
                  expect(tracks.length).toEqual(0);

                  models.Track.find({ recordist: lanny._id, published: null }).limit(1).sort({ updatedAt: 'desc' }).then(mostRecentTrack => {
                    expect(mostRecentTrack.length).toEqual(1);

                    browser.pressButton('Delete', err => {
                      if (err) return done.fail(err);
                      browser.assert.success();

                      models.Track.find({ path: mostRecentTrack[0].path }).then(tracks => {
                        expect(tracks.length).toEqual(0);

                        models.Track.find({ recordist: lanny._id, published: { '$ne': null }}).then(tracks => {
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
});
