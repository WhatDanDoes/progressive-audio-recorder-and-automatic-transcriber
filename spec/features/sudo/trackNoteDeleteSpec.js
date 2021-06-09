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

describe('sudo Deleting a note on a track', () => {

  let browser, agent, lanny;

  beforeEach(done => {
    browser = new Browser({ waitDuration: '30s' });
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

    describe('authorized', () => {

      describe('from the show page', () => {

        describe('root\'s owns resource', () => {

          describe('root wrote note', () => {
            let track;
            beforeEach(done => {
              browser.clickLink('Tracks', err => {
                if (err) done.fail(err);
                browser.assert.success();

                //browser.visit(`/track/${root.getAgentDirectory()}/root1.ogg`, err => {
                browser.clickLink(`a[href="/track/${root.getAgentDirectory()}/root1.ogg"]`, err => {
                  if (err) done.fail(err);
                  browser.assert.success();

                  browser.fill('#track-note-field', 'Groovy, baby! Yeah!');
                  browser.pressButton('.post-note[aria-label="Post"]', err => {
                    if (err) return done.fail(err);
                    browser.assert.success();

                    models.Track.findOne({ path: `uploads/${root.getAgentDirectory()}/root1.ogg` }).populate('notes').then(result => {
                      track = result;
                      expect(track.notes.length).toEqual(1);

                      done();
                    }).catch(err => {
                      done.fail(err);
                    })
                  });
                });
              });
            });

            it('provides a button to delete the note', done => {
              browser.assert.url({ pathname: `/track/${root.getAgentDirectory()}/root1.ogg` });
              browser.assert.element('article.note .note-menu');
              browser.assert.element(`article.note .note-menu form[action="/track/${root.getAgentDirectory()}/root1.ogg/note/${track.notes[0]._id}?_method=DELETE"]`);

              done();
            });

            it('lands in the right place', done => {
              browser.pressButton('.delete-note', err => {
                if (err) return done.fail(err);
                browser.assert.success();

                browser.assert.text('.alert.alert-success', 'Note deleted');
                browser.assert.url({ pathname: `/track/${root.getAgentDirectory()}/root1.ogg` });
                done();
              });
            });

            it('removes the note from the database', done => {
              expect(track.notes.length).toEqual(1);
              browser.pressButton('.delete-note', err => {
                if (err) return done.fail(err);
                browser.assert.success();

                models.Track.findOne({ _id: track._id }).populate('notes').then(result => {
                  track = result;
                  expect(track.notes.length).toEqual(0);

                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
            });

            it('does not display the deleted note in the notes list', done => {
              browser.assert.elements('section.notes article.note', 1);

              browser.pressButton('.delete-note', err => {
                if (err) return done.fail(err);

                browser.assert.elements('article.notes section.note', 0);
                done();
              });
            });
          });

          describe('another agent wrote note', () => {
            let track;
            beforeEach(done => {
              models.Track.findOne({ path: `uploads/${root.getAgentDirectory()}/root1.ogg` }).then(result => {
                result.published = new Date();
                result.notes.push({ author: lanny._id, text: "Word to your mom" });

                result.save().then(result => {
                  track = result;

                  browser.visit(`/track/${root.getAgentDirectory()}/root1.ogg`, err => {
                   if (err) done.fail(err);
                    browser.assert.success();

                    done();
                  });
                }).catch(err => {
                  done.fail(err);
                })
              }).catch(err => {
                done.fail(err);
              })
            });

            it('provides a button to delete the note', done => {
              browser.assert.url({ pathname: `/track/${root.getAgentDirectory()}/root1.ogg` });
              browser.assert.element('article.note .note-menu');
              browser.assert.element(`article.note .note-menu form[action="/track/${root.getAgentDirectory()}/root1.ogg/note/${track.notes[0]._id}?_method=DELETE"]`);

              done();
            });

            it('lands in the right place', done => {
              browser.pressButton('.delete-note', err => {
                if (err) return done.fail(err);
                browser.assert.success();

                browser.assert.text('.alert.alert-success', 'Note deleted');
                browser.assert.url({ pathname: `/track/${root.getAgentDirectory()}/root1.ogg` });
                done();
              });
            });

            it('removes the note from the database', done => {
              expect(track.notes.length).toEqual(1);
              browser.pressButton('.delete-note', err => {
                if (err) return done.fail(err);
                browser.assert.success();

                models.Track.findOne({ _id: track._id }).populate('notes').then(result => {
                  track = result;
                  expect(track.notes.length).toEqual(0);

                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
            });

            it('does not display the deleted note in the notes list', done => {
              browser.assert.elements('section.notes article.note', 1);

              browser.pressButton('.delete-note', err => {
                if (err) return done.fail(err);

                browser.assert.elements('article.notes section.note', 0);
                done();
              });
            });
          });
        });

        describe('root does not own resource', () => {

          describe('root wrote note', () => {

            let track;
            beforeEach(done => {
              models.Track.findOne({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg` }).then(result => {
                result.published = new Date();
                result.notes.push({ author: agent._id, text: "Word to your mom" });

                result.save().then(result => {
                  track = result;

                  browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, err => {
                    if (err) done.fail(err);
                    browser.assert.success();

                    done();
                  });
                }).catch(err => {
                  done.fail(err);
                })
              }).catch(err => {
                done.fail(err);
              })
            });

            it('provides a button to delete the note', done => {
              browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}/lanny1.ogg` });
              browser.assert.element('article.note .note-menu');
              browser.assert.element(`article.note .note-menu form[action="/track/${lanny.getAgentDirectory()}/lanny1.ogg/note/${track.notes[0]._id}?_method=DELETE"]`);

              done();
            });

            it('lands in the right place', done => {
              browser.pressButton('.delete-note', err => {
                if (err) return done.fail(err);
                browser.assert.success();

                browser.assert.text('.alert.alert-success', 'Note deleted');
                browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}/lanny1.ogg` });
                done();
              });
            });

            it('removes the note from the database', done => {
              expect(track.notes.length).toEqual(1);
              browser.pressButton('.delete-note', err => {
                if (err) return done.fail(err);
                browser.assert.success();

                models.Track.findOne({ _id: track._id }).populate('notes').then(result => {
                  track = result;
                  expect(track.notes.length).toEqual(0);

                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
            });

            it('does not display the deleted note in the notes list', done => {
              browser.assert.elements('section.notes article.note', 1);

              browser.pressButton('.delete-note', err => {
                if (err) return done.fail(err);

                browser.assert.elements('article.notes section.note', 0);
                done();
              });
            });
          });

          describe('another agent wrote note', () => {

            let track;
            beforeEach(done => {
              models.Track.findOne({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg` }).then(result => {
                result.published = new Date();
                result.notes.push({ author: agent._id, text: "Word to your mom" });
                result.notes.push({ author: lanny._id, text: "Right back at ya!" });

                result.save().then(result => {
                  track = result;

                  browser.clickLink(lanny.getAgentDirectory(), err => {
                    if (err) return done.fail(err);

                    browser.clickLink(`a[href="/track/${lanny.getAgentDirectory()}/lanny1.ogg"]`, err => {
                      if (err) return done.fail(err);
                      browser.assert.success();
                      browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}/lanny1.ogg` });
                      done();
                    });
                  });
                }).catch(err => {
                  done.fail(err);
                });
              }).catch(err => {
                done.fail(err);
              });
            });

            it('provides a menu to modify/delete every note', () => {
              browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}/lanny1.ogg` });

              browser.assert.elements('article.note', 2);
              browser.assert.elements('article.note .note-menu', 2);

              expect(track.notes[0].author).toEqual(agent._id);
              expect(track.notes[1].author).toEqual(lanny._id);

              browser.assert.elements(`article.note .note-menu form[action="/track/${lanny.getAgentDirectory()}/lanny1.ogg/note/${track.notes[0]._id}?_method=DELETE"]`, 1);
              browser.assert.elements(`article.note .note-menu form[action="/track/${lanny.getAgentDirectory()}/lanny1.ogg/note/${track.notes[1]._id}?_method=DELETE"]`, 1);
            });

            it('deletes notes from the database', done => {
              models.Track.findOne({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
                expect(tracks.notes.length).toEqual(2);

                browser.pressButton('.delete-note', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  models.Track.findOne({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
                    expect(tracks.notes.length).toEqual(1);

                    browser.pressButton('.delete-note', err => {
                      if (err) return done.fail(err);
                      browser.assert.success();

                      models.Track.findOne({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
                        expect(tracks.notes.length).toEqual(0);

                        done();
                      }).catch(err => {
                        done.fail(err);
                      });
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
});
