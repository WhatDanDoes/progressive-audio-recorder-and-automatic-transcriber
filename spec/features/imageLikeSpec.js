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

describe('Liking an image', () => {

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
    it('does not allow liking an image', done => {
      request(app)
        .patch(`/image/${agent.getAgentDirectory()}/image2.jpg/like`)
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
            'image1.jpg': fs.readFileSync('spec/files/troll.jpg'),
            'image2.jpg': fs.readFileSync('spec/files/troll.jpg'),
            'image3.jpg': fs.readFileSync('spec/files/troll.jpg'),
          },
          [`uploads/${lanny.getAgentDirectory()}`]: {
            'lanny1.jpg': fs.readFileSync('spec/files/troll.jpg'),
            'lanny2.jpg': fs.readFileSync('spec/files/troll.jpg'),
            'lanny3.jpg': fs.readFileSync('spec/files/troll.jpg'),
          },
          'public/images/uploads': {}
        });

        const images = [
          { path: `uploads/${agent.getAgentDirectory()}/image1.jpg`, photographer: agent._id, published: new Date() },
          { path: `uploads/${agent.getAgentDirectory()}/image2.jpg`, photographer: agent._id },
          { path: `uploads/${agent.getAgentDirectory()}/image3.jpg`, photographer: agent._id },
          { path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`, photographer: lanny._id },
          { path: `uploads/${lanny.getAgentDirectory()}/lanny2.jpg`, photographer: lanny._id },
          { path: `uploads/${lanny.getAgentDirectory()}/lanny3.jpg`, photographer: lanny._id },
        ];
        models.Image.create(images).then(results => {

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

        models.Image.where('published').ne(null).then(images => {
          expect(images.length).toEqual(1);
          expect(images[0].likes.length).toEqual(0);

          images[0].likes.push(lanny._id);
          images[0].save().then(res => {

            browser.visit('/', err => {
              if (err) return done.fail(err);

              browser.assert.text('article.post section.feedback-controls i.like-button', '1 note');

              images[0].likes.push(agent._id);
              images[0].save().then(res => {
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
        models.Image.where('published').ne(null).then(images => {
          expect(images.length).toEqual(1);
          expect(images[0].likes.length).toEqual(0);

          browser.click('article.post section.feedback-controls i.like-button.fa-heart');

          setTimeout(() => {
            models.Image.where('published').ne(null).then(images => {
              expect(images.length).toEqual(1);
              expect(images[0].likes.length).toEqual(1);
              expect(images[0].likes[0]._id).toEqual(agent._id);

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
        models.Image.where('published').ne(null).then(images => {
          expect(images.length).toEqual(1);
          expect(images[0].likes.length).toEqual(0);

          images[0].likes.push(lanny._id);
          images[0].save().then(res => {

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
          models.Image.where('published').ne(null).then(images => {
            expect(images.length).toEqual(1);
            expect(images[0].likes.length).toEqual(1);
            browser.click('article.post section.feedback-controls i.like-button.fa-heart');

            setTimeout(() => {
              models.Image.where('published').ne(null).then(images => {
                expect(images.length).toEqual(1);
                expect(images[0].likes.length).toEqual(0);

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
        browser.visit(`/image/${lanny.getAgentDirectory()}/lanny1.jpg`, err => {
          if (err) done.fail(err);
          browser.assert.success();
          done();
        });
      });

      it('displays the pluralized note count', done => {
        browser.assert.text('article.post section.feedback-controls i.like-button', '');

        models.Image.where('published').ne(null).then(images => {
          expect(images.length).toEqual(1);
          expect(images[0].likes.length).toEqual(0);

          images[0].likes.push(lanny._id);
          images[0].save().then(res => {

            browser.visit(`/${images[0].path.replace('uploads', 'image')}`, err => {
              if (err) return done.fail(err);

              browser.assert.text('article.post section.feedback-controls i.like-button', '1 note');

              images[0].likes.push(agent._id);
              images[0].save().then(res => {
                browser.visit(`/${images[0].path.replace('uploads', 'image')}`, err => {
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
        models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg` }).then(images => {
          expect(images.length).toEqual(1);
          expect(images[0].likes.length).toEqual(0);

          browser.click('article.post section.feedback-controls i.like-button.fa-heart');

          setTimeout(() => {
            models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg` }).then(images => {
              expect(images.length).toEqual(1);
              expect(images[0].likes.length).toEqual(1);
              expect(images[0].likes[0]._id).toEqual(agent._id);

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

          browser.visit(`/image/${lanny.getAgentDirectory()}/lanny1.jpg`, err => {
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
          models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg` }).then(images => {
            expect(images.length).toEqual(1);
            expect(images[0].likes.length).toEqual(1);
            browser.click('article.post section.feedback-controls i.like-button.fa-heart');

            setTimeout(() => {
              models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg` }).then(images => {
                expect(images.length).toEqual(1);
                expect(images[0].likes.length).toEqual(0);

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

            browser.visit(`/image/${lanny.getAgentDirectory()}/lanny1.jpg`, err => {
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
