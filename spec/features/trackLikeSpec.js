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

describe('Liking a track', () => {

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
        .patch(`/track/${agent.getAgentDirectory()}/track2.ogg/like`)
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

      it('displays the pluralized note count', done => {
        browser.assert.text('article.post section.feedback-controls i.like-button', '');

        models.Track.where('published').ne(null).then(tracks => {
          expect(tracks.length).toEqual(1);
          expect(tracks[0].likes.length).toEqual(0);

          tracks[0].likes.push(lanny._id);
          tracks[0].save().then(res => {

            browser.visit('/', err => {
              if (err) return done.fail(err);

              browser.assert.text('article.post section.feedback-controls i.like-button', '1 note');

              tracks[0].likes.push(agent._id);
              tracks[0].save().then(res => {
                browser.visit('/', err => {
                  if (err) return done.fail(err);

                  browser.assert.text('article.post section.feedback-controls i.like-button', '2 notes');
                  done();
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

      it('changes the Liked font to indicate that you like the post', done => {
        browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 1);
        browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 0);

        browser.click('article.post section.feedback-controls i.like-button.fa-heart');

        // 2020-10-13 Not sure why browser.wait doesn't do anything...
        setTimeout(() => {
          browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 0);
          browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 1);

          done();
        }, 250);
      });

      it('updates the database', done => {
        models.Track.where('published').ne(null).then(tracks => {
          expect(tracks.length).toEqual(1);
          expect(tracks[0].likes.length).toEqual(0);

          browser.click('article.post section.feedback-controls i.like-button.fa-heart');

          setTimeout(() => {
            models.Track.where('published').ne(null).then(tracks => {
              expect(tracks.length).toEqual(1);
              expect(tracks[0].likes.length).toEqual(1);
              expect(tracks[0].likes[0]._id).toEqual(agent._id);

              done();
            }).catch(err => {
              done.fail(err);
            });
          }, 250);

        }).catch(err => {
          done.fail(err);
        });
      });

      it('maintains the liked status on refresh', done => {
        browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 0);
        browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 1);

        browser.click('article.post section.feedback-controls i.like-button.fa-heart');

        setTimeout(() => {
          browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 1);
          browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 0);

          browser.visit('/', err => {
            if (err) return done.fail(err);

            browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 1);
            browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 0);

            done();
          });
        }, 250);
      });

      it('displays the note count', done => {
        browser.assert.text('article.post section.feedback-controls i.like-button', '');
        browser.click('article.post section.feedback-controls i.like-button.fa-heart');
        setTimeout(() => {
          browser.assert.text('article.post section.feedback-controls i.like-button', '1 note');
          done();
        }, 250);
      });

      it('displays the pluralized note count', done => {
        models.Track.where('published').ne(null).then(tracks => {
          expect(tracks.length).toEqual(1);
          expect(tracks[0].likes.length).toEqual(0);

          tracks[0].likes.push(lanny._id);
          tracks[0].save().then(res => {

            browser.visit('/', err => {
              if (err) return done.fail(err);

              browser.assert.text('article.post section.feedback-controls i.like-button', '1 note');

              browser.click('article.post section.feedback-controls i.like-button.fa-heart');
              setTimeout(() => {
                browser.assert.text('article.post section.feedback-controls i.like-button', '2 notes');
                done();
              }, 250);

            });
          }).catch(err => {
            done.fail(err);
          });
        }).catch(err => {
          done.fail(err);
        });
      });

      describe('if already liked', () => {
        beforeEach(done => {
          browser.click('article.post section.feedback-controls i.like-button.fa-heart');
          setTimeout(() => {
            done();
          }, 250);
        });

        it('changes the Liked font to indicate that you no longer like the post', done => {
          browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 1);
          browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 0);
          browser.click('article.post section.feedback-controls i.like-button.fa-heart');

          // 2020-10-13 Not sure why browser.wait doesn't do anything...
          setTimeout(() => {
            browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 1);
            browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 0);

            done();
          }, 250);
        });

        it('updates the database', done => {
          models.Track.where('published').ne(null).then(tracks => {
            expect(tracks.length).toEqual(1);
            expect(tracks[0].likes.length).toEqual(1);
            browser.click('article.post section.feedback-controls i.like-button.fa-heart');

            setTimeout(() => {
              models.Track.where('published').ne(null).then(tracks => {
                expect(tracks.length).toEqual(1);
                expect(tracks[0].likes.length).toEqual(0);

                done();
              }).catch(err => {
                done.fail(err);
              });
            }, 250);

          }).catch(err => {
            done.fail(err);
          });
        });

        it('maintains the unliked status on refresh', done => {
          browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 1);
          browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 0);

          browser.click('article.post section.feedback-controls i.like-button.fa-heart');

          setTimeout(() => {
            browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 0);
            browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 1);

            browser.visit('/', err => {
              if (err) return done.fail(err);

              browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 0);
              browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 1);

              done();
            });
          }, 250);
        });

        it('resets the note count', done => {
          browser.assert.text('article.post section.feedback-controls i.like-button', '1 note');
          browser.click('article.post section.feedback-controls i.like-button.fa-heart');
          setTimeout(() => {
            browser.assert.text('article.post section.feedback-controls i.like-button', '');
            done();
          }, 250);
        });
      });
    });

    describe('from the show page', () => {
      beforeEach(done => {
        models.Agent.findOne({ _id: agent._id }).then(result => {
          agent = result;
          browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, err => {
            if (err) done.fail(err);
            browser.assert.success();
            done();
          });
        }).catch(err => {
          done.fail(err);
        });
      });

      it('displays the pluralized note count', done => {
        browser.assert.text('article.post section.feedback-controls i.like-button', '');

        models.Track.where('published').ne(null).then(tracks => {
          expect(tracks.length).toEqual(1);
          expect(tracks[0].likes.length).toEqual(0);

          tracks[0].likes.push(lanny._id);
          tracks[0].save().then(res => {

            browser.visit(`/${tracks[0].path.replace('uploads', 'track')}`, err => {
              if (err) return done.fail(err);

              browser.assert.text('article.post section.feedback-controls i.like-button', '1 note');

              tracks[0].likes.push(agent._id);
              tracks[0].save().then(res => {
                browser.visit(`/${tracks[0].path.replace('uploads', 'track')}`, err => {
                  if (err) return done.fail(err);

                  browser.assert.text('article.post section.feedback-controls i.like-button', '2 notes');
                  done();
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

      it('changes the Liked font to indicate that you like the post', done => {
        browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 1);
        browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 0);

        browser.click('article.post section.feedback-controls i.like-button.fa-heart');

        // 2020-10-13 Not sure why browser.wait doesn't do anything...
        setTimeout(() => {
          browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 0);
          browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 1);

          done();
        }, 250);
      });

      it('maintains the Liked font on page reload', done => {
        browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 1);
        browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 0);

        browser.click('article.post section.feedback-controls i.like-button.fa-heart');

        // 2020-10-13 Not sure why browser.wait doesn't do anything...
        setTimeout(() => {
          browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 0);
          browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 1);
          browser.reload(err => {
            if (err) return done.fail(err);

            browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 0);
            browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 1);
            done();
          });
        }, 250);
      });

      it('adds the like to the list of notes on page load', done => {
        browser.assert.elements('article.post section.likes header aside', 0);

        browser.click('article.post section.feedback-controls i.like-button.fa-heart');

        // 2020-10-13 Not sure why browser.wait doesn't do anything...
        setTimeout(() => {
          browser.reload(err => {
            if (err) return done.fail(err);
            browser.assert.elements('article.post section.likes header aside i.fas.fa-heart', 1);
            browser.assert.text('article.post section.likes header aside', `${agent.get('nickname')} s this`);

            done();
          });
        }, 250);
      });

      it('updates the database', done => {
        models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg` }).then(tracks => {
          expect(tracks.length).toEqual(1);
          expect(tracks[0].likes.length).toEqual(0);

          browser.click('article.post section.feedback-controls i.like-button.fa-heart');

          setTimeout(() => {
            models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg` }).then(tracks => {
              expect(tracks.length).toEqual(1);
              expect(tracks[0].likes.length).toEqual(1);
              expect(tracks[0].likes[0]._id).toEqual(agent._id);

              done();
            }).catch(err => {
              done.fail(err);
            });
          }, 250);

        }).catch(err => {
          done.fail(err);
        });
      });

      it('maintains the liked status on refresh', done => {
        browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 0);
        browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 1);

        browser.click('article.post section.feedback-controls i.like-button.fa-heart');

        setTimeout(() => {
          browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 1);
          browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 0);

          browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, err => {
            if (err) return done.fail(err);

            browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 1);
            browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 0);

            done();
          });
        }, 250);
      });

      describe('if already liked', () => {
        beforeEach(done => {
          browser.click('article.post section.feedback-controls i.like-button.fa-heart');
          setTimeout(() => {
            done();
          }, 250);
        });

        it('changes the Liked font to indicate that you no longer like the post', done => {
          browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 1);
          browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 0);
          browser.click('article.post section.feedback-controls i.like-button.fa-heart');

          // 2020-10-13 Not sure why browser.wait doesn't do anything...
          setTimeout(() => {
            browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 1);
            browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 0);

            done();
          }, 250);
        });

        it('updates the database', done => {
          models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg` }).then(tracks => {
            expect(tracks.length).toEqual(1);
            expect(tracks[0].likes.length).toEqual(1);
            browser.click('article.post section.feedback-controls i.like-button.fa-heart');

            setTimeout(() => {
              models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg` }).then(tracks => {
                expect(tracks.length).toEqual(1);
                expect(tracks[0].likes.length).toEqual(0);

                done();
              }).catch(err => {
                done.fail(err);
              });
            }, 250);

          }).catch(err => {
            done.fail(err);
          });
        });

        it('maintains the unliked status on refresh', done => {
          browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 1);
          browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 0);

          browser.click('article.post section.feedback-controls i.like-button.fa-heart');

          setTimeout(() => {
            browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 0);
            browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 1);

            browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, err => {
              if (err) return done.fail(err);

              browser.assert.elements('article.post section.feedback-controls i.like-button.fas.fa-heart', 0);
              browser.assert.elements('article.post section.feedback-controls i.like-button.far.fa-heart', 1);

              done();
            });
          }, 250);
        });
      });
    });
  });
});
