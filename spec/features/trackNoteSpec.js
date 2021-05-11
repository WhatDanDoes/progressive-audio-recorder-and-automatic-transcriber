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

describe('Writing note on a track', () => {

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
    it('does not allow liking a track', done => {
      request(app)
        .post(`/track/${agent.getAgentDirectory()}/track2.ogg/note`)
        .send({ text: 'Groovy, baby! Yeah...' })
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

    describe('from the landing page', () => {
      beforeEach(done => {
        browser.visit('/', err => {
          if (err) done.fail(err);
          browser.assert.success();
          done();
        });
      });

      it('provides a text field in which to write a note', done => {
        browser.assert.element('article.post');
        browser.assert.element('article.post section.feedback-controls span.accordion i.far.fa-comment');
        browser.assert.element(`article.post section.feedback-controls span.accordion form[action="/track/${agent.getAgentDirectory()}/track1.ogg/note"]`);
        browser.assert.element(`article.post section.feedback-controls span.accordion textarea#track-note-field[name="text"][maxlength="500"]`);
        browser.assert.element(`article.post section.feedback-controls span.accordion form button.post-note[type="submit"][aria-label="Post"]`);

        done();
      });

      it('does not add a note if the text is empty', done => {
        browser.assert.text('article.post section.feedback-controls i.like-button', '');
        browser.fill('#track-note-field', '  ');
        browser.pressButton('.post-note[aria-label="Post"]', err => {
          if (err) return done.fail(err);

          browser.assert.text('.alert.alert-danger', 'Empty note not saved');
          browser.assert.text('article.post section.feedback-controls i.like-button', '');

          done();
        });
      });

      it('lands in the right place', done => {
        browser.fill('#track-note-field', 'Groovy, baby! Yeah!');
        browser.pressButton('.post-note[aria-label="Post"]', err => {
          if (err) return done.fail(err);
          browser.assert.success();

          browser.assert.text('.alert.alert-success', 'Note posted');
          browser.assert.url({pathname: '/'});

          done();
        });
      });

      it('preserves newline characters in the database', done => {
        let newlines = 'Why\n\nThe\n\nFace\n\n?';
        browser.fill('#track-note-field', newlines);
        browser.pressButton('.post-note[aria-label="Post"]', err => {
          if (err) return done.fail(err);
          browser.assert.success();

          models.Track.find({ published: { $ne: null } }).populate('notes').then(tracks => {
            expect(tracks.length).toEqual(1);
            expect(tracks[0].notes.length).toEqual(1);
            expect(tracks[0].notes[0].text).toEqual(newlines);

            done();
          }).catch(err => {
            done.fail(err);
          });
        });
      });

      it('preserves newline characters on the display', done => {
        let newlines = 'Why\n\nThe\n\nFace\n\n?';
        browser.fill('#track-note-field', newlines);
        browser.pressButton('.post-note[aria-label="Post"]', err => {
          if (err) return done.fail(err);
          browser.assert.success();

          browser.visit(`/track/${agent.getAgentDirectory()}/track1.ogg`, err => {
            browser.assert.text('.note-content p:first-child', 'Why');
            browser.assert.text('.note-content p:nth-child(2)', 'The');
            browser.assert.text('.note-content p:nth-child(3)', 'Face');
            browser.assert.text('.note-content p:last-child', '?');
            done();
          });
        });
      });

      it('applies markdown to the note content', done => {
        let newlines = '# Why\n\n_The_\n\n ## Face\n\n?';
        browser.fill('#track-note-field', newlines);
        browser.pressButton('.post-note[aria-label="Post"]', err => {
          if (err) return done.fail(err);
          browser.assert.success();

          browser.visit(`/track/${agent.getAgentDirectory()}/track1.ogg`, err => {
            browser.assert.text('.note-content h1', 'Why');
            browser.assert.text('.note-content em', 'The');
            browser.assert.text('.note-content h2', 'Face');
            done();
          });
        });
      });



      it('adds the note to total likes and pluralizes note count', done => {
        browser.assert.text('article.post section.feedback-controls i.like-button', '');

        browser.fill('#track-note-field', 'Groovy, baby! Yeah!');
        browser.pressButton('.post-note[aria-label="Post"]', err => {
          if (err) return done.fail(err);

          browser.assert.text('article.post section.feedback-controls i.like-button', '1 note');

          browser.fill('#track-note-field', 'Greetings');
          browser.pressButton('.post-note[aria-label="Post"]', err => {
            if (err) return done.fail(err);

            browser.assert.text('article.post section.feedback-controls i.like-button', '2 notes');
            done();
          });
        });
      });

      it('displays note content on track show', done => {
        browser.assert.elements('article.post section.notes', 0);

        browser.fill('#track-note-field', 'Greetings');
        browser.pressButton('.post-note[aria-label="Post"]', err => {
          if (err) return done.fail(err);

          browser.clickLink(`a[href="/track/${agent.getAgentDirectory()}/track1.ogg"]`, err => {
            if (err) return done.fail(err);
  
            browser.assert.text('article.post section.notes header aside .note-content', 'Greetings');
            done();
          });
        });
      });
    });

    describe('from the show page', () => {
      beforeEach(done => {
        browser.visit(`/track/${agent.getAgentDirectory()}/track1.ogg`, err => {
          if (err) done.fail(err);
          browser.assert.success();
          done();
        });
      });

      it('provides a text field in which to write a note', done => {
        browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}/track1.ogg` });
        browser.assert.element('article.post');
        browser.assert.element('article.post section.feedback-controls span.accordion i.far.fa-comment');
        browser.assert.element(`article.post section.feedback-controls span.accordion form[action="/track/${agent.getAgentDirectory()}/track1.ogg/note"]`);
        browser.assert.element(`article.post section.feedback-controls span.accordion textarea#track-note-field[name="text"][maxlength="500"]`);
        browser.assert.element(`article.post section.feedback-controls span.accordion form button.post-note[type="submit"][aria-label="Post"]`);

        done();
      });

      it('does not add a note if the text is empty', done => {
        browser.assert.text('article.post section.feedback-controls i.like-button', '');
        browser.fill('#track-note-field', '  ');
        browser.pressButton('.post-note[aria-label="Post"]', err => {
          if (err) return done.fail(err);

          browser.assert.text('.alert.alert-danger', 'Empty note not saved');
          browser.assert.text('article.post section.feedback-controls i.like-button', '');

          done();
        });
      });

      it('lands in the right place', done => {
        browser.fill('#track-note-field', 'Groovy, baby! Yeah!');
        browser.pressButton('.post-note[aria-label="Post"]', err => {
          if (err) return done.fail(err);
          browser.assert.success();

          browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}/track1.ogg` });
          done();
        });
      });

      it('adds the note to total likes and pluralizes note count', done => {
        browser.assert.text('article.post section.feedback-controls i.like-button', '');

        browser.fill('#track-note-field', 'Groovy, baby! Yeah!');
        browser.pressButton('.post-note[aria-label="Post"]', err => {
          if (err) return done.fail(err);

          browser.assert.text('article.post section.feedback-controls i.like-button', '1 note');

          browser.fill('#track-note-field', 'Greetings');
          browser.pressButton('.post-note[aria-label="Post"]', err => {
            if (err) return done.fail(err);

            browser.assert.text('article.post section.feedback-controls i.like-button', '2 notes');
            done();
          });
        });
      });

      it('displays the new note in a list', done => {
        browser.assert.elements('article.notes section.note', 0);

        browser.fill('#track-note-field', 'Groovy, baby! Yeah!');
        browser.pressButton('.post-note[aria-label="Post"]', err => {
          if (err) return done.fail(err);

          browser.assert.elements('section.notes article.note', 1);
          browser.assert.elements('section.notes article.note header img.avatar', 1);
          browser.assert.elements('section.notes article.note header aside', 1);

          browser.fill('#track-note-field', 'Greetings');
          browser.pressButton('.post-note[aria-label="Post"]', err => {
            if (err) return done.fail(err);

            browser.assert.elements('section.notes article.note', 2);
            browser.assert.elements('section.notes article.note header img.avatar', 2);
            browser.assert.elements('section.notes article.note header aside', 2);
            done();
          });
        });
      });

      it('maintains note count when like is toggled', done => {
        browser.assert.text('article.post section.feedback-controls i.like-button', '');

        browser.fill('#track-note-field', 'Groovy, baby! Yeah!');
        browser.pressButton('.post-note[aria-label="Post"]', err => {
          if (err) return done.fail(err);

          browser.assert.text('article.post section.feedback-controls i.like-button', '1 note');

          browser.fill('#track-note-field', 'Greetings');
          browser.pressButton('.post-note[aria-label="Post"]', err => {
            if (err) return done.fail(err);

            browser.assert.text('article.post section.feedback-controls i.like-button', '2 notes');

            // Like
            browser.click('article.post section.feedback-controls i.like-button.fa-heart');
            setTimeout(() => {
              browser.assert.text('article.post section.feedback-controls i.like-button', '3 notes');

              // Un-Like
              browser.click('article.post section.feedback-controls i.like-button.fa-heart');
              setTimeout(() => {
                browser.assert.text('article.post section.feedback-controls i.like-button', '2 notes');

                // Re-Like
                browser.click('article.post section.feedback-controls i.like-button.fa-heart');
                setTimeout(() => {
                  browser.assert.text('article.post section.feedback-controls i.like-button', '3 notes');

                  done();
                }, 250);
              }, 250);
            }, 250);
          });
        });
      });
    });
  });
});
