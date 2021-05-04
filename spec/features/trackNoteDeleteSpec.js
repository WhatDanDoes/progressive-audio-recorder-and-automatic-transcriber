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

describe('Deleting a note on a track', () => {

  let browser, agent, lanny;

  beforeEach(done => {
    browser = new Browser({ waitDuration: '30s' });
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

  describe('unauthenticated', () => {
    it('does not allow deleting a note on a track', done => {
      request(app)
        .delete(`/track/${agent.getAgentDirectory()}/track2.ogg/note/some-fake-note-id`)
        .end((err, res) => {
          if (err) return done.fail(err);
          expect(res.status).toEqual(401);
          expect(res.body.message).toEqual('You are not logged in');
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
          { path: `uploads/${agent.getAgentDirectory()}/track1.ogg`, recordist: agent._id, published: new Date() },
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

    describe('unauthorized', () => {
      beforeEach(() => {
        //delete process.env.SUDO;
      });

      describe('from the show page', () => {

        let track;
        beforeEach(done => {
          models.Track.findOne({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg` }).then(result => {
            result.published = new Date();
            result.notes.push({ author: lanny._id, text: "Word to your mom" });

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

        it('does not provide a menu to modify/delete the note', done => {
          browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}/lanny1.ogg` });
          browser.assert.elements('article.note .note-menu', 0);

          done();
        });

        it('returns 403', done => {
          request(app)
            .delete(`/track/${lanny.getAgentDirectory()}/lanny1.ogg/note/${track.notes[0]._id}`)
            .set('Cookie', browser.cookies)
            .end((err, res) => {
              if (err) return done.fail(err);
              expect(res.status).toEqual(403);
              expect(res.body.message).toEqual('You are not authorized to access that resource');
              done();
            });
        });

        it('does not remove the note from the database', done => {
          expect(track.notes.length).toEqual(1);

          request(app)
            .delete(`/track/${lanny.getAgentDirectory()}/lanny1.ogg/note/${track.notes[0]._id}`)
            .set('Cookie', browser.cookies)
            .expect(403)
            .end((err, res) => {
              if (err) return done.fail(err);

              models.Track.findOne({ _id: track._id }).populate('notes').then(result => {
                track = result;
                expect(track.notes.length).toEqual(1);

                done();
              }).catch(err => {
                done.fail(err);
              });
            });
        });
      });
    });

    describe('authorized', () => {
      describe('from the show page', () => {
        describe('agent owns resource', () => {
          describe('agent wrote note', () => {
            let track;
            beforeEach(done => {
              browser.visit(`/track/${agent.getAgentDirectory()}/track1.ogg`, err => {
                if (err) done.fail(err);
                browser.assert.success();

                browser.fill('textarea', 'Groovy, baby! Yeah!');
                browser.pressButton('.post-note[aria-label="Post"]', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  models.Track.findOne({ path: `uploads/${agent.getAgentDirectory()}/track1.ogg` }).populate('notes').then(result => {
                    track = result;
                    expect(track.notes.length).toEqual(1);

                    done();
                  }).catch(err => {
                    done.fail(err);
                  })
                });
              });
            });

            it('provides a button to delete the note', done => {
              browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}/track1.ogg` });
              browser.assert.element('article.note .note-menu');
              browser.assert.element(`article.note .note-menu form[action="/track/${agent.getAgentDirectory()}/track1.ogg/note/${track.notes[0]._id}?_method=DELETE"]`);

              done();
            });

            it('lands in the right place', done => {
              browser.pressButton('.delete-note', err => {
                if (err) return done.fail(err);
                browser.assert.success();

                browser.assert.text('.alert.alert-success', 'Note deleted');
                browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}/track1.ogg` });
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
              models.Track.findOne({ path: `uploads/${agent.getAgentDirectory()}/track1.ogg` }).then(result => {
                result.published = new Date();
                result.notes.push({ author: lanny._id, text: "Word to your mom" });

                result.save().then(result => {
                  track = result;

                  browser.visit(`/track/${agent.getAgentDirectory()}/track1.ogg`, err => {
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
              browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}/track1.ogg` });
              browser.assert.element('article.note .note-menu');
              browser.assert.element(`article.note .note-menu form[action="/track/${agent.getAgentDirectory()}/track1.ogg/note/${track.notes[0]._id}?_method=DELETE"]`);

              done();
            });

            it('lands in the right place', done => {
              browser.pressButton('.delete-note', err => {
                if (err) return done.fail(err);
                browser.assert.success();

                browser.assert.text('.alert.alert-success', 'Note deleted');
                browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}/track1.ogg` });
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

        describe('agent does not own resource', () => {
          describe('agent wrote note', () => {

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
        });

        describe('sudo mode', () => {

          afterEach(() => {
            delete process.env.SUDO;
          });

          describe('set', () => {
            describe('non sudo agent', () => {

              let track;
              beforeEach(done => {
                process.env.SUDO = 'lanny@example.com';
                expect(process.env.SUDO).not.toEqual(agent.email);

                models.Track.findOne({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg` }).then(result => {
                  result.published = new Date();
                  result.notes.push({ author: agent._id, text: "Word to your mom" });
                  result.notes.push({ author: lanny._id, text: "Right back at ya!" });

                  result.save().then(result => {
                    track = result;

                    done();
                  }).catch(err => {
                    done.fail(err);
                  });
                }).catch(err => {
                  done.fail(err);
                });
              });

              it('provides a menu to modify/delete the agent\'s own note but not that belonging to another', done => {
                browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, err => {
                  if (err) return done.fail();
                  browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}/lanny1.ogg` });

                  browser.assert.elements('article.note', 2);

                  browser.assert.elements('article.note .note-menu', 1);
                  expect(track.notes[0].author).toEqual(agent._id);
                  browser.assert.elements(`article.note .note-menu form[action="/track/${lanny.getAgentDirectory()}/lanny1.ogg/note/${track.notes[0]._id}?_method=DELETE"]`, 1);

                  browser.assert.elements(`article.note .note-menu form[action="/track/${lanny.getAgentDirectory()}/lanny1.ogg/note/${track.notes[1]._id}?_method=DELETE"]`, 0);
                  done();
                });
              });
            });

            describe('sudo agent', () => {

              let track;
              beforeEach(done => {
                process.env.SUDO = agent.email;

                models.Track.findOne({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg` }).then(result => {
                  result.published = new Date();
                  result.notes.push({ author: agent._id, text: "Word to your mom" });
                  result.notes.push({ author: lanny._id, text: "Right back at ya!" });

                  result.save().then(result => {
                    track = result;

                    browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, err => {
                      if (err) return done.fail(err);
                      browser.assert.success();
                      browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}/lanny1.ogg` });
                      done();
                    });

                  }).catch(err => {
                    done.fail(err);
                  });
                }).catch(err => {
                  done.fail(err);
                });
              });


              it('provides a menu to modify/delete every note', done => {
                browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, err => {
                  if (err) return done.fail();
                  browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}/lanny1.ogg` });

                  browser.assert.elements('article.note', 2);
                  browser.assert.elements('article.note .note-menu', 2);

                  expect(track.notes[0].author).toEqual(agent._id);
                  expect(track.notes[1].author).toEqual(lanny._id);

                  browser.assert.elements(`article.note .note-menu form[action="/track/${lanny.getAgentDirectory()}/lanny1.ogg/note/${track.notes[0]._id}?_method=DELETE"]`, 1);
                  browser.assert.elements(`article.note .note-menu form[action="/track/${lanny.getAgentDirectory()}/lanny1.ogg/note/${track.notes[1]._id}?_method=DELETE"]`, 1);

                  done();
                });
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
});
