'use strict';

const fixtures = require('pow-mongoose-fixtures');
const models = require('../../../models');

const app = require('../../../app');
const request = require('supertest');

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

describe('sudo Deleting a track', () => {

  let browser, agent, lanny;

  beforeEach(function(done) {
    browser = new Browser({ waitDuration: '30s', loadCss: false });
    //browser.debug();
    fixtures.load(__dirname + '/../../fixtures/agents.js', models.mongoose, function(err) {
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

    describe('authenticated', function() {

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

      it('renders a form to allow root to delete a track', function(done) {
        browser.clickLink('Tracks', function(err) {
          if (err) return done.fail(err);

          browser.clickLink(`a[href="/track/${root.getAgentDirectory()}/root1.ogg"]`, (err) => {
            if (err) return done.fail(err);
            browser.assert.success();
            browser.assert.element('.delete-track-form');
            browser.assert.element(`form[action="/track/${root.getAgentDirectory()}/root1.ogg?_method=DELETE"]`);
            done();
          });
        });
      });

      describe('deleting', function() {

        describe('root\'s own resource', function() {

          beforeEach(function(done) {
            browser.clickLink('Tracks', function(err) {
              if (err) return done.fail(err);

              browser.clickLink(`a[href="/track/${root.getAgentDirectory()}/root1.ogg"]`, (err) => {
                if (err) return done.fail(err);
                browser.assert.success();
                done();
              });
            });
          });

          it('redirects to the origin album if the delete is successful', function(done) {
            browser.pressButton('button[aria-label="Delete"]', function(err) {
              if (err) return done.fail(err);

              browser.assert.success();
              browser.assert.text('.alert.alert-info', 'Track deleted');
              browser.assert.url({ pathname: `/track/${root.getAgentDirectory()}` });
              done();
            });
          });

          it('deletes the track from the file system', function(done) {
            fs.readdir(`uploads/${root.getAgentDirectory()}`, (err, files) => {
              if (err) return done.fail(err);
              expect(files.length).toEqual(3);
              expect(files.includes('root1.ogg')).toBe(true);

              browser.pressButton('button[aria-label="Delete"]', function(err) {
                if (err) return done.fail(err);
                browser.assert.success();

                fs.readdir(`uploads/${root.getAgentDirectory()}`, (err, files) => {
                  if (err) return done.fail(err);
                  expect(files.length).toEqual(2);
                  expect(files.includes('root1.ogg')).toBe(false);

                  done();
                });
              });
            });
          });

          it('deletes the track from the database', function(done) {
            models.Track.find({ path: `uploads/${root.getAgentDirectory()}/root1.ogg` }).then(tracks => {
              expect(tracks.length).toEqual(1);

              browser.pressButton('button[aria-label="Delete"]', function(err) {
                if (err) return done.fail(err);
                browser.assert.success();

                models.Track.find({ path: `uploads/${root.getAgentDirectory()}/root1.ogg` }).then(tracks => {
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

        describe('non-sudo resources', function() {
          beforeEach(function(done) {
            browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, (err) => {
              if (err) return done.fail(err);
              browser.assert.success();
              done();
            });
          });

          it('shows a delete button', () => {
            browser.assert.element('.delete-track-form');
          });

          it('deletes the track from the file system', function(done) {
            fs.readdir(`uploads/${lanny.getAgentDirectory()}`, (err, files) => {
              if (err) return done.fail(err);
              expect(files.length).toEqual(3);
              expect(files.includes('lanny1.ogg')).toBe(true);

              browser.pressButton(`form[action="/track/${lanny.getAgentDirectory()}/lanny1.ogg?_method=DELETE"] button[aria-label="Delete"]`, err => {
                if (err) return done.fail(err);

                fs.readdir(`uploads/${lanny.getAgentDirectory()}`, (err, files) => {
                  if (err) return done.fail(err);
                  expect(files.length).toEqual(2);
                  expect(files.includes('lanny1.ogg')).toBe(false);

                  done();
                });
              });
            });
          });

          it('deletes the track record from the database', done => {
            models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg` }).then(tracks => {
              expect(tracks.length).toEqual(1);

              browser.pressButton(`form[action="/track/${lanny.getAgentDirectory()}/lanny1.ogg?_method=DELETE"] button[aria-label="Delete"]`, err => {
                if (err) return done.fail(err);

                models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg` }).then(tracks => {
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
                  if (err) done.fail(err);
                  browser.assert.success();

                  done();
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

      it('renders a form to allow root to delete a track', () => {
        browser.assert.url({ pathname: `/track/${root.getAgentDirectory()}` });
        browser.assert.elements('.delete-track-form', 3);
        browser.assert.element(`form[action="/track/${root.getAgentDirectory()}/root1.ogg?_method=DELETE"]`);
      });

      describe('deleting', () => {
        describe('root\'s own resource', () => {
          beforeEach(() => {
            browser.assert.url({ pathname: `/track/${root.getAgentDirectory()}` });
          });

          it('redirects to the origin album if the delete is successful', done => {
            browser.pressButton('button[aria-label="Delete"]', err => {
              if (err) return done.fail(err);

              browser.assert.success();
              browser.assert.text('.alert.alert-info', 'Track deleted');
              browser.assert.url({ pathname: `/track/${root.getAgentDirectory()}` });
              done();
            });
          });

          it('deletes the track from the file system', done => {
            models.Track.find({ recordist: root._id, published: null}).limit(1).sort({ updatedAt: 'desc' }).then(mostRecentTrack => {
              expect(mostRecentTrack.length).toEqual(1);

              let filename = mostRecentTrack[0].path.split('/');
              filename = filename[filename.length - 1];

              fs.readdir(`uploads/${root.getAgentDirectory()}`, (err, files) => {
                if (err) return done.fail(err);
                expect(files.length).toEqual(3);
                expect(files.includes(filename)).toBe(true);

                browser.pressButton('button[aria-label="Delete"]', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  fs.readdir(`uploads/${root.getAgentDirectory()}`, (err, files) => {
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

        describe('non-sudo resource', () => {
          beforeEach(done => {
            browser.visit(`/track/${lanny.getAgentDirectory()}`, (err) => {
              if (err) return done.fail(err);
              browser.assert.success();
              browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}` });
              done();
            });
          });

          it('shows a delete button', () => {
            browser.assert.elements('.delete-track-form', 3);
          });

          it('deletes the track from the database', done => {
            models.Track.find({ recordist: lanny._id, published: { '$ne': null }}).then(tracks => {
              expect(tracks.length).toEqual(0);

              models.Track.find({ recordist: lanny._id, published: null }).limit(1).sort({ updatedAt: 'desc' }).then(mostRecentTrack => {
                expect(mostRecentTrack.length).toEqual(1);

                browser.pressButton('button[aria-label="Delete"]', err => {
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

          it('deletes the track from the file system', done => {
            models.Track.find({ recordist: lanny._id, published: null }).limit(1).sort({ updatedAt: 'desc' }).then(mostRecentTrack => {
            //models.Track.find({ recordist: lanny._id, published: { '$ne': null } }).limit(1).sort({ updatedAt: 'desc' }).then(mostRecentTrack => {
              expect(mostRecentTrack.length).toEqual(1);

              let filename = mostRecentTrack[0].path.split('/');
              filename = filename[filename.length - 1];

              fs.readdir(`uploads/${lanny.getAgentDirectory()}`, (err, files) => {
                if (err) return done.fail(err);
                expect(files.length).toEqual(3);
                expect(files.includes(filename)).toBe(true);

                browser.pressButton('button[aria-label="Delete"]', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  fs.readdir(`uploads/${lanny.getAgentDirectory()}`, (err, files) => {
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
      });
    });
  });
});
