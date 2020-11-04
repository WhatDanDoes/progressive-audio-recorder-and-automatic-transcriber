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

describe('Flagging an image', () => {

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

  describe('unauthenticated', () => {
    it('does not allow flagging an image', done => {
      request(app)
        .patch(`/image/${agent.getAgentDirectory()}/image2.jpg/flag`)
        .end((err, res) => {
          if (err) return done.fail(err);
          expect(res.status).toEqual(302);
          expect(res.header.location).toEqual('/');
          done();
        });
    });

    it('doesn\'t allow viewing flagged resources', done => {
      browser.visit('/image/flagged', err => {
        if (err) return done.fail(err);
        browser.assert.success();

        browser.assert.url('/');
        browser.assert.text('.alert.alert-danger', 'You need to login first');
        done();
      });
    });
  });

  describe('from show view', () => {

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
            { path: `uploads/${agent.getAgentDirectory()}/image1.jpg`, photographer: agent._id },
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

      it('renders a form to allow an agent to flag an image', done => {
        browser.clickLink(`a[href="/image/${agent.getAgentDirectory()}/image1.jpg"]`, err => {
          if (err) return done.fail(err);
          browser.assert.success();
          browser.assert.element('.flag-image-form');
          browser.assert.element(`form[action="/image/${agent.getAgentDirectory()}/image1.jpg/flag?_method=PATCH"][method="post"]`);
          done();
        });
      });

      describe('flagging', () => {
        describe('owner resource', () => {
          beforeEach(done => {
            browser.clickLink(`a[href="/image/${agent.getAgentDirectory()}/image1.jpg"]`, err => {
              if (err) return done.fail(err);
              browser.assert.success();
              done();
            });
          });

          it('redirects to the referer if the flag is successful', done => {
            browser.pressButton('Flag post', err => {
              if (err) return done.fail(err);

              browser.assert.success();
              browser.assert.text('.alert.alert-success', 'Image flagged');
              browser.assert.url({ pathname: `/image/${agent.getAgentDirectory()}` });
              done();
            });
          });

          it('adds agent to list of flaggers and sets flagged attribute', done => {
            models.Image.find({ path: `uploads/${agent.getAgentDirectory()}/image1.jpg`}).then(images => {
              expect(images.length).toEqual(1);
              expect(images[0].flagged).toBe(false);
              expect(images[0].flaggers).toEqual([]);

              browser.pressButton('Flag post', err => {
                if (err) return done.fail(err);
                browser.assert.success();

                models.Image.find({ path: `uploads/${agent.getAgentDirectory()}/image1.jpg`}).then(images => {
                  expect(images.length).toEqual(1);
                  expect(images[0].flagged).toBe(true);
                  expect(images[0].flaggers).toEqual([agent._id]);

                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
            }).catch(err => {
              done.fail(err);
            });
          });

          /**
           * Take note:
           *
           * Until broader administrative privileges can be established, a resource
           * owner will be able to un-flag his own image outside of sudo mode
           */
          it('disables the Publish button on the flagged image', done => {
            browser.visit(`/image/${agent.getAgentDirectory()}`, err => {
              if (err) return done.fail(err);
              browser.assert.element(`a[href="/image/${agent.getAgentDirectory()}/image1.jpg"]`)
              browser.assert.text(`form[action="/image/${agent.getAgentDirectory()}/image1.jpg"][method="post"] button.publish-image`, 'Publish');

              browser.clickLink(`a[href="/image/${agent.getAgentDirectory()}/image1.jpg"]`, err => {
                if (err) return done.fail(err);

                browser.pressButton('Flag post', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  browser.assert.elements(`form[action="/image/${agent.getAgentDirectory()}/image1.jpg/flag?_method=PATCH"][method="post"] button.publish-image`, 'Deflag');
                  done();
                });
              });
            });
          });

          it('redirects to the referer if the image is flagged', done => {
            browser.pressButton('Flag post', err => {
              if (err) return done.fail(err);
              browser.assert.success();

              browser.visit(`/image/${agent.getAgentDirectory()}/image1.jpg`, err => {
                if (err) return done.fail(err);

                browser.assert.text('.alert.alert-danger', 'Image flagged');
                browser.assert.url({ pathname: `/image/${agent.getAgentDirectory()}` });
                done();
              });
            });
          });
        });

        describe('readable resource', () => {
          beforeEach(done => {
            browser.visit(`/image/${lanny.getAgentDirectory()}/lanny1.jpg`, (err) => {
              if (err) return done.fail(err);
              browser.assert.success();
              done();
            });
          });

          it('shows a flag button', () => {
            browser.assert.element('.flag-image-form');
          });

          it('adds agent to list of flaggers and sets flagged attribute', done => {
            models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`}).then(images => {
              expect(images.length).toEqual(1);
              expect(images[0].flagged).toBe(false);
              expect(images[0].flaggers).toEqual([]);

              browser.pressButton('Flag post', err => {
                if (err) return done.fail(err);
                browser.assert.success();

                models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`}).then(images => {
                  expect(images.length).toEqual(1);
                  expect(images[0].flagged).toBe(true);
                  expect(images[0].flaggers).toEqual([agent._id]);

                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
            }).catch(err => {
              done.fail(err);
            });
          });

          it('does not display the flagged image on the referer page', done => {
            browser.visit(`/image/${lanny.getAgentDirectory()}`, err => {
              if (err) return done.fail(err);
              browser.assert.element(`a[href="/image/${lanny.getAgentDirectory()}/lanny1.jpg"]`)

              browser.clickLink(`a[href="/image/${lanny.getAgentDirectory()}/lanny1.jpg"]`, err => {
                if (err) return done.fail(err);

                browser.pressButton('Flag post', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  browser.assert.elements(`a[href="/image/${lanny.getAgentDirectory()}/lanny1.jpg"]`, 0)
                  done();
                });
              });
            });
          });

          it('redirects to the referer if the image is flagged', done => {
            browser.pressButton('Flag post', err => {
              if (err) return done.fail(err);
              browser.assert.success();

              browser.visit(`/image/${lanny.getAgentDirectory()}/lanny1.jpg`, err => {
                if (err) return done.fail(err);

                browser.assert.text('.alert.alert-danger', 'Image flagged');
                browser.assert.url({ pathname: `/image/${lanny.getAgentDirectory()}` });
                done();
              });
            });
          });
        });

        describe('unauthorized resource', () => {
          let troy;
          beforeEach(done => {
            models.Agent.findOne({ email: 'troy@example.com' }).then(result => {
              troy = result;

              expect(agent.canRead.length).toEqual(1);
              expect(agent.canRead[0]).not.toEqual(troy._id);

              mkdirp(`uploads/${troy.getAgentDirectory()}`, err => {
                fs.writeFileSync(`uploads/${troy.getAgentDirectory()}/troy1.jpg`, fs.readFileSync('spec/files/troll.jpg'));

                const images = [
                  { path: `uploads/${troy.getAgentDirectory()}/troy1.jpg`, photographer: troy._id },
                ];
                models.Image.create(images).then(results => {

                  browser.visit(`/image/${troy.getAgentDirectory()}/troy1.jpg`, err => {
                    if (err) return done.fail(err);
                    done();
                  });
                }).catch(err => {
                  done.fail(err);
                });
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

          it('does not modify the database record', done => {
            models.Image.find({ path: `uploads/${troy.getAgentDirectory()}/troy1.jpg`}).then(images => {
              expect(images.length).toEqual(1);
              expect(images[0].flagged).toBe(false);
              expect(images[0].flaggers).toEqual([]);

              request(app)
                .patch(`/image/${troy.getAgentDirectory()}/troy1.jpg/flag`)
                .set('Cookie', browser.cookies)
                .expect(302)
                .end((err, res) => {
                  if (err) return done.fail(err);

                  models.Image.find({ path: `uploads/${troy.getAgentDirectory()}/troy1.jpg`}).then(images => {
                    expect(images.length).toEqual(1);
                    expect(images[0].flagged).toBe(false);
                    expect(images[0].flaggers).toEqual([]);

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

          beforeEach(done => {
            browser.visit(`/image/${lanny.getAgentDirectory()}`, err => {
              if (err) return done.fail(err);

              browser.clickLink(`a[href="/image/${lanny.getAgentDirectory()}/lanny1.jpg"]`, err => {
                if (err) return done.fail(err);

                browser.pressButton('Flag post', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  done();
                });
              });
            });
          });

          afterEach(() => {
            delete process.env.SUDO;
          });

          describe('not set', () => {
            it('doesn\'t allow viewing flagged resources', done => {
              browser.visit('/image/flagged', err => {
                if (err) return done.fail(err);
                browser.assert.success();

                browser.assert.url('/');
                browser.assert.text('.alert.alert-danger', 'You are not authorized to access that resource');
                done();
              });
            });

            it('does not allow de-flagging the image', done => {
              models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`}).then(images => {
                expect(images.length).toEqual(1);
                expect(images[0].flagged).toBe(true);
                expect(images[0].flaggers).toEqual([agent._id]);

                request(app)
                  .patch(`/image/${lanny.getAgentDirectory()}/lanny1.jpg/flag`)
                  .set('Cookie', browser.cookies)
                  .set('Referer', `"/image/${lanny.getAgentDirectory()}/lanny1.jpg"`)
                  .expect(302)
                  .end((err, res) => {
                    if (err) return done.fail(err);

                    models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`}).then(images => {
                      expect(images.length).toEqual(1);
                      expect(images[0].flagged).toBe(true);
                      expect(images[0].flaggers).toEqual([agent._id]);

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

          describe('set', () => {
            describe('non sudo agent', () => {

              beforeEach(() => {
                process.env.SUDO = 'lanny@example.com';
                expect(process.env.SUDO).not.toEqual(agent.email);
              });

              it('doesn\'t allow viewing flagged resources', done => {
                browser.assert.elements('a[href="/image/flagged"]', 0);
                browser.visit('/image/flagged', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  browser.assert.url('/');
                  browser.assert.text('.alert.alert-danger', 'You are not authorized to access that resource');
                  done();
                });
              });

              it('does not allow de-flagging the image', done => {
                models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`}).then(images => {
                  expect(images.length).toEqual(1);
                  expect(images[0].flagged).toBe(true);
                  expect(images[0].flaggers).toEqual([agent._id]);

                  request(app)
                    .patch(`/image/${lanny.getAgentDirectory()}/lanny1.jpg/flag`)
                    .set('Cookie', browser.cookies)
                    .set('Referer', `"/image/${lanny.getAgentDirectory()}/lanny1.jpg"`)
                    .expect(302)
                    .end((err, res) => {
                      if (err) return done.fail(err);

                      models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`}).then(images => {
                        expect(images.length).toEqual(1);
                        expect(images[0].flagged).toBe(true);
                        expect(images[0].flaggers).toEqual([agent._id]);

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

            describe('sudo agent', () => {

              beforeEach(()=> {
                process.env.SUDO = agent.email;
              });

              it('is allowed to view flagged images', done => {
                browser.visit(`/image/${lanny.getAgentDirectory()}/lanny1.jpg`, (err) => {
                  if (err) return done.fail(err);
                  browser.assert.success();
                  browser.assert.text('.alert.alert-danger', 'Image flagged');
                  browser.assert.url({ pathname: `/image/${lanny.getAgentDirectory()}/lanny1.jpg` });
                  done();
                });
              });

              it('renders flagged resources with management UI', done => {
                browser.visit('/image/flagged', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  browser.assert.elements('section.image img', 1);
                  browser.assert.element(`.image a[href="/image/${lanny.getAgentDirectory()}/lanny1.jpg"] img[src="/uploads/${lanny.getAgentDirectory()}/lanny1.jpg"]`);
                  browser.assert.element(`form[action="/image/${lanny.getAgentDirectory()}/lanny1.jpg/flag?_method=PATCH"][method="post"]`);
                  browser.assert.element(`form[action="/image/${lanny.getAgentDirectory()}/lanny1.jpg?_method=DELETE"]`);
                  done();
                });
              });

              describe('deflagging', () => {
                it('shows image on owner\'s page', done => {
                  browser.visit(`/image/${lanny.getAgentDirectory()}`, (err) => {
                    if (err) return done.fail(err);

                    browser.assert.elements(`.image a[href="/image/${lanny.getAgentDirectory()}/lanny1.jpg"] img[src="/uploads/${lanny.getAgentDirectory()}/lanny1.jpg"]`, 0);

                    browser.visit('/image/flagged', err => {
                      if (err) return done.fail(err);
                      browser.assert.elements(`form[action="/image/${lanny.getAgentDirectory()}/lanny1.jpg/flag?_method=PATCH"][method="post"] button.publish-image`, 'Deflag');

                      browser.pressButton('Deflag', err => {
                        if (err) return done.fail(err);
                        browser.assert.success();

                        browser.visit(`/image/${lanny.getAgentDirectory()}`, (err) => {
                          if (err) return done.fail(err);
                          browser.assert.success();

                          browser.assert.element(`.image a[href="/image/${lanny.getAgentDirectory()}/lanny1.jpg"] img[src="/uploads/${lanny.getAgentDirectory()}/lanny1.jpg"]`);
                          done();
                        });
                      });
                    });
                  });
                });

                it('does not allow image flagger to flag again', done => {
                  browser.visit('/image/flagged', err => {
                    if (err) return done.fail(err);
                    browser.assert.elements(`form[action="/image/${lanny.getAgentDirectory()}/lanny1.jpg/flag?_method=PATCH"][method="post"] button.publish-image`, 'Deflag');

                    browser.pressButton('Deflag', err => {
                      if (err) return done.fail(err);
                      browser.assert.success();

                      process.env.SUDO = 'lanny@example.com';

                      browser.visit(`/image/${lanny.getAgentDirectory()}/lanny1.jpg`, err => {
                        if (err) return done.fail(err);
                        browser.assert.element(`.image img[src="/uploads/${lanny.getAgentDirectory()}/lanny1.jpg"]`);

                        browser.pressButton('Flag post', err => {
                          if (err) return done.fail(err);
                          browser.assert.url({ pathname: `/image/${lanny.getAgentDirectory()}` });

                          browser.assert.text('.alert.alert-danger', 'This post has administrative approval');
                          browser.assert.element(`.image a[href="/image/${lanny.getAgentDirectory()}/lanny1.jpg"] img[src="/uploads/${lanny.getAgentDirectory()}/lanny1.jpg"]`);

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
  });

  describe('from index view', () => {

    describe('unauthenticated', () => {
      it('does not show the flag button', done => {
        browser.visit('/', err => {
          if (err) return done.fail(err);
          browser.assert.success();

          browser.assert.elements('.flag-image', 0);
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
            { path: `uploads/${agent.getAgentDirectory()}/image2.jpg`, photographer: agent._id, published: new Date() },
            { path: `uploads/${agent.getAgentDirectory()}/image3.jpg`, photographer: agent._id },
            { path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`, photographer: lanny._id, published: new Date() },
            { path: `uploads/${lanny.getAgentDirectory()}/lanny2.jpg`, photographer: lanny._id, published: new Date() },
            { path: `uploads/${lanny.getAgentDirectory()}/lanny3.jpg`, photographer: lanny._id },
          ];
          models.Image.create(images).then(results => {

            browser.clickLink('Login', err => {
              if (err) done.fail(err);
              browser.assert.success();
              browser.assert.url({ pathname: `/image/${agent.getAgentDirectory()}` });
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

      it('renders forms to allow an agent to flag images', done => {
        browser.visit('/', err => {
          if (err) return done.fail(err);
          browser.assert.success();
          browser.assert.elements('.flag-image-form', 4);
          browser.assert.elements('button.flag-image', 4);
          done();
        });
      });

      describe('flagging', () => {
        beforeEach(done => {
          browser.visit('/', err => {
            if (err) return done.fail(err);
            browser.assert.success();
            done();
          });
        });

        it('redirects to home if the flag is successful', done => {
          //
          // Careful here... this is pressing the first button. There are four Flag buttons
          //
          // If this flakes out somehow, remember this:
          //   browser.document.forms[0].submit();
          //
          // 2020-10-2 https://stackoverflow.com/a/40264336/1356582
          //

          browser.pressButton('Flag post', err => {
            if (err) return done.fail(err);
            browser.assert.success();
            browser.assert.text('.alert.alert-success', 'Image flagged');
            browser.assert.url({ pathname: '/' });
            done();
          });
        });

        it('adds agent to list of flaggers and sets flagged attribute', done => {
          models.Image.find({}).sort({updatedAt: 'desc'}).then(images => {
            expect(images.length).toEqual(6);
            expect(images[0].flagged).toBe(false);
            expect(images[0].flaggers).toEqual([]);

            browser.pressButton('Flag post', err => {
              if (err) return done.fail(err);
              browser.assert.success();

              models.Image.find({}).sort({updatedAt: 'desc'}).then(images => {
                expect(images.length).toEqual(6);
                expect(images[0].flagged).toBe(true);
                expect(images[0].flaggers).toEqual([agent._id]);

                done();
              }).catch(err => {
                done.fail(err);
              });
            });
          }).catch(err => {
            done.fail(err);
          });
        });

        it('does not display the flagged image on the referer page', done => {
          // Need to know what's at the top of the roll
          models.Image.find({ published: { '$ne': null } }).sort({ published: 'desc' }).then(images => {

            browser.assert.url('/');
            browser.assert.element(`a[href="/${images[0].path.replace('uploads', 'image')}"]`)
            browser.pressButton('Flag post', err => {
              if (err) return done.fail(err);
              browser.assert.success();

              browser.assert.url('/');
              browser.assert.elements(`a[href="/${images[0].path.replace('uploads', 'image')}"]`, 0)
              done();
            });

          }).catch(err => {
            done.fail(err);
          });
        });

        describe('sudo mode', () => {

          let image;
          beforeEach(done => {
            models.Image.find({ published: { '$ne': null } }).sort({ published: 'desc' }).populate('photographer').then(images => {
              image = images[0];

              browser.visit('/', err => {
                if (err) return done.fail(err);

                browser.pressButton('Flag post', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  done();
                });
              });
            }).catch(err => {
              done.fail(err);
            });
          });

          afterEach(() => {
            delete process.env.SUDO;
          });

          describe('not set', () => {

            it('doesn\'t allow viewing flagged resources', done => {
              browser.visit('/image/flagged', err => {
                if (err) return done.fail(err);
                browser.assert.success();

                browser.assert.url('/');
                browser.assert.text('.alert.alert-danger', 'You are not authorized to access that resource');
                done();
              });
            });

            it('does not allow de-flagging the image', done => {
              models.Image.find({ path: image.path }).then(images => {
                expect(images.length).toEqual(1);
                expect(images[0].flagged).toBe(true);
                expect(images[0].flaggers).toEqual([agent._id]);

                request(app)
                  .patch(`/${image.path.replace('uploads', 'image')}/flag`)
                  .set('Cookie', browser.cookies)
                  .set('Referer', `/${image.path.replace('uploads', 'image')}`)
                  .expect(302)
                  .end((err, res) => {
                    if (err) return done.fail(err);

                    models.Image.find({ path: image.path }).then(images => {
                      expect(images.length).toEqual(1);
                      expect(images[0].flagged).toBe(true);
                      expect(images[0].flaggers).toEqual([agent._id]);

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

          describe('set', () => {
            describe('non sudo agent', () => {

              beforeEach(() => {
                process.env.SUDO = 'lanny@example.com';
                expect(process.env.SUDO).not.toEqual(agent.email);
              });

              it('doesn\'t allow viewing flagged resources', done => {
                browser.visit('/image/flagged', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  browser.assert.url('/');
                  browser.assert.text('.alert.alert-danger', 'You are not authorized to access that resource');
                  done();
                });
              });

              it('does not allow de-flagging the image', done => {
                models.Image.find({ path: image.path }).then(images => {
                  expect(images.length).toEqual(1);
                  expect(images[0].flagged).toBe(true);
                  expect(images[0].flaggers).toEqual([agent._id]);

                  request(app)
                    .patch(`/${image.path.replace('uploads', 'image')}/flag`)
                    .set('Cookie', browser.cookies)
                    .set('Referer', `/${image.path.replace('uploads', 'image')}`)
                    .expect(302)
                    .end((err, res) => {
                      if (err) return done.fail(err);

                      models.Image.find({ path: image.path }).then(images => {
                        expect(images.length).toEqual(1);
                        expect(images[0].flagged).toBe(true);
                        expect(images[0].flaggers).toEqual([agent._id]);

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

            describe('sudo agent', () => {

              beforeEach(() => {
                process.env.SUDO = agent.email;
              });

              it('is allowed to view flagged images', done => {
                browser.visit(`/${image.path.replace('uploads', 'image')}`, err => {
                  if (err) return done.fail(err);
                  browser.assert.success();
                  browser.assert.text('.alert.alert-danger', 'Image flagged');
                  browser.assert.url({ pathname: `/${image.path.replace('uploads', 'image')}` });
                  done();
                });
              });

              it('renders flagged resources with management UI', done => {
                browser.visit('/image/flagged', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  browser.assert.elements('section.image img', 1);
                  browser.assert.element(`.image a[href="/${image.path.replace('uploads', 'image')}"] img[src="/${image.path}"]`);
                  browser.assert.element(`form[action="/${image.path.replace('uploads', 'image')}/flag?_method=PATCH"][method="post"]`);
                  browser.assert.element(`form[action="/${image.path.replace('uploads', 'image')}?_method=DELETE"]`);
                  done();
                });
              });

              describe('deflagging', () => {
                it('shows image on landing page', done => {
                  browser.visit('/', (err) => {
                    if (err) return done.fail(err);

                    browser.assert.elements(`.photo a[href="/${image.path.replace('uploads', 'image')}"] img[src="/${image.path}"]`, 0);

                    browser.visit('/image/flagged', err => {
                      if (err) return done.fail(err);
                      browser.assert.elements(`form[action="/${image.path.replace('uploads', 'image')}/flag?_method=PATCH"][method="post"] button.publish-image`, 'Deflag');

                      browser.pressButton('Deflag', err => {
                        if (err) return done.fail(err);
                        browser.assert.success();

                        browser.visit('/', err => {
                          if (err) return done.fail(err);
                          browser.assert.success();

                          browser.assert.element(`.photo a[href="/${image.path.replace('uploads', 'image')}"] img[src="/${image.path}"]`);
                          done();
                        });
                      });
                    });
                  });
                });

                it('does not allow image flagger to flag again', done => {
                  browser.visit('/image/flagged', err => {
                    if (err) return done.fail(err);
                    browser.assert.elements(`form[action="/${image.path.replace('uploads', 'image')}flag?_method=PATCH"][method="post"] button.publish-image`, 'Deflag');

                    browser.pressButton('Deflag', err => {
                      if (err) return done.fail(err);
                      browser.assert.success();

                      process.env.SUDO = 'lanny@example.com';

                      browser.visit(`/${image.path.replace('uploads', 'image')}`, err => {
                        if (err) return done.fail(err);
                        browser.assert.element(`.image img[src="/${image.path}"]`);

                        browser.pressButton('Flag post', err => {
                          if (err) return done.fail(err);
                          browser.assert.url({ pathname: `/image/${image.photographer.getAgentDirectory()}` });

                          browser.assert.text('.alert.alert-danger', 'This post has administrative approval');
                          browser.assert.element(`.image a[href="/${image.path.replace('uploads', 'image')}"] img[src="/${image.path}"]`);

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
  });
});
