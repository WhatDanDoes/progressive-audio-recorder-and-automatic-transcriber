'use strict';

describe('Image', () => {
  const _profile = require('../fixtures/sample-auth0-profile-response');

  const db = require('../../models');
  const Image = db.Image;

  let image, agent;

  beforeEach(done => {
    db.Agent.create(_profile).then(obj => {
      agent = obj;
      image = new Image({ path: 'pic.jpg', photographer: agent });
      done();
    }).catch(err => {
      done.fail(err);
    });
  });

  afterEach(done => {
    db.mongoose.connection.db.dropDatabase().then(result => {
      done();
    }).catch(err => {
      done.fail(err);
    });
  });

  describe('basic validation', () => {
    it('sets the createdAt and updatedAt fields', done => {
      expect(image.createdAt).toBe(undefined);
      expect(image.updatedAt).toBe(undefined);
      image.save().then(obj => {
        expect(image.createdAt instanceof Date).toBe(true);
        expect(image.updatedAt instanceof Date).toBe(true);
        done();
      }).catch(err => {
        done.fail(err);
      });
    });

    it('does not allow two identical paths', done => {
      image.save().then(obj => {
        Image.create({ path: 'pic.jpg', photographer: agent }).then(obj => {
          done.fail('This should not have saved');
        }).catch(error => {
          expect(Object.keys(error.errors).length).toEqual(1);
          expect(error.errors['path'].message).toEqual('Image file name collision');
          done();
        });
      }).catch(error => {
        done.fail(error);
      });
    });

    it('does not allow an empty path field', done => {
      Image.create({ path: ' ', photographer: agent }).then(obj => {
        done.fail('This should not have saved');
      }).catch(error => {
        expect(Object.keys(error.errors).length).toEqual(1);
        expect(error.errors['path'].message).toEqual('No path supplied');
        done();
      });
    });

    it('does not allow an undefined path field', done => {
      Image.create({ photographer: agent }).then(obj => {
        done.fail('This should not have saved');
      }).catch(error => {
        expect(Object.keys(error.errors).length).toEqual(1);
        expect(error.errors['path'].message).toEqual('No path supplied');
        done();
      });
    });

    it('requires a photographer credit', done => {
      image.photographer = undefined;
      expect(image.photographer).toBe(undefined);
      image.save().then(obj => {
        done.fail('This should not have saved');
      }).catch(error => {
        expect(Object.keys(error.errors).length).toEqual(1);
        expect(error.errors['photographer'].message).toEqual('Who took the picture?');
        done();
      });
    });

    it('sets the default fields to their default values', done => {
      expect(image.flagged).toBe(false);
      expect(image.flaggers).toEqual([]);
      expect(image.published).toEqual(null);
      expect(image.likes).toEqual([]);
      image.save().then(obj => {
        expect(image.flagged).toBe(false);
        expect(image.flaggers).toEqual([]);
        expect(image.published).toEqual(null);
        expect(image.likes).toEqual([]);
        expect(image.notes).toEqual([]);
        done();
      }).catch(error => {
        done.fail(error);
      });
    });

    describe('notes field', () => {
      it('saves a note and the author agent\'s _id', done => {
        image.notes.push({ author: agent._id, text: 'd'.repeat(500) });
        image.save().then(obj => {
          expect(image.notes.length).toEqual(1);
          expect(image.notes[0].author).toEqual(agent._id);
          expect(image.notes[0].text).toEqual('d'.repeat(500));
          done();
        }).catch(error => {
          done.fail(error);
        });
      });

      it('does not allow notes of over 500 characters', done => {
        image.notes.push({ author: agent._id, text: 'd'.repeat(501) });
        image.save().then(obj => {
          done.fail('This should not have saved');
        }).catch(error => {
          expect(Object.keys(error.errors).length).toEqual(1);
          expect(error.errors['notes.0.text'].message).toEqual('That note is too long (max 500 characters)');

          done();
        });
      });

      it('does not allow empty notes', done => {
        image.notes.push({ author: agent._id, text: '   ' });
        image.save().then(obj => {
          done.fail('This should not have saved');
        }).catch(error => {
          expect(Object.keys(error.errors).length).toEqual(1);
          expect(error.errors['notes.0.text'].message).toEqual('Empty note not saved');
          done();
        });
      });

      it('does not allow undefined notes', done => {
        image.notes.push({ author: agent._id });
        image.save().then(obj => {
          done.fail('This should not have saved');
        }).catch(error => {
          expect(Object.keys(error.errors).length).toEqual(1);
          expect(error.errors['notes.0.text'].message).toEqual('Empty note not saved');
          done();
        });
      });

      it('requires an author', done => {
        image.notes.push({ text: 'Paperback writer, wriiiiiter...' });
        image.save().then(obj => {
          done.fail('This should not have saved');
        }).catch(error => {
          expect(Object.keys(error.errors).length).toEqual(1);
          expect(error.errors['notes.0.author'].message).toEqual('Who wrote the note?');
          done();
        });
      });

      it('allows multiple notes', done => {
        image.notes.push({ author: agent._id, text: 'My favourite animal is the beefalo' });
        image.save().then(obj => {
          expect(image.notes.length).toEqual(1);
          image.notes.push({ author: agent._id, text: 'My favourite colour is brown' });
          image.save().then(obj => {
            expect(image.notes.length).toEqual(2);
            done();
          }).catch(error => {
            done.fail(error);
          });
        }).catch(error => {
          done.fail(error);
        });
      });
    });

    /**
     * #toggleFlagged
     */
    describe('.toggleFlagged', () => {
      it('toggles the flagged property', done => {
        expect(image.flagged).toBe(false);
        expect(image.flaggers).toEqual([]);
        // on
        image.toggleFlagged((err, image) => {
          if (err) return done.fail(err);
          expect(image.flagged).toBe(true);
          expect(image.flaggers).toEqual([]);
          // off
          image.toggleFlagged((err, image) => {
            if (err) return done.fail(err);
            expect(image.flagged).toBe(false);
            expect(image.flaggers).toEqual([]);
            done();
          });
        });
      });
    });

    /**
     * #flag
     */
    describe('#flag', () => {
      beforeEach(done => {
        agent.save().then(obj => {
          done();
        }).catch(err => {
          done.fail(err);
        });
      });

      it('adds agent to list of agents who flagged this image', done => {
        expect(image.flagged).toBe(false);
        expect(image.flaggers.length).toEqual(0);
        // flag
        image.flag(agent, (err, image) => {
          if (err) return done.fail(err);
          expect(image.flagged).toBe(true);
          expect(image.flaggers.length).toEqual(1);
          expect(image.flaggers[0]).toEqual(agent._id);
          // unflag
          image.flag(agent, (err, image) => {
            if (err) return done.fail(err);
            expect(image.flagged).toBe(false);
            expect(image.flaggers.length).toEqual(0);

            done();
          });
        });
      });

      it('adds agent to list of agents who flagged this image if passed an agent _id', done => {
        expect(image.flagged).toBe(false);
        expect(image.flaggers.length).toEqual(0);
        // like
        image.flag(agent._id, (err, image) => {
          if (err) return done.fail(err);
          expect(image.flagged).toBe(true);
          expect(image.flaggers.length).toEqual(1);
          expect(image.flaggers[0]).toEqual(agent._id);
          // unlike
          image.flag(agent._id, (err, image) => {
            if (err) return done.fail(err);
            expect(image.flagged).toBe(false);
            expect(image.flaggers.length).toEqual(0);

            done();
          });
        });
      });
    });


    /**
     * #togglePublished
     */
    describe('.togglePublished', () => {
      it('toggles the published property', done => {
        expect(image.published).toEqual(null);
        // on
        image.togglePublished((err, image) => {
          if (err) return done.fail(err);
          expect(image.published instanceof Date).toBe(true);
          // off
          image.togglePublished((err, image) => {
            if (err) return done.fail(err);
            expect(image.published).toEqual(null);
            done();
          });
        });
      });
    });

    /**
     * #toggleLike
     */
    describe('#toggleLiked', () => {
      beforeEach(done => {
        agent.save().then(obj => {
          done();
        }).catch(err => {
          done.fail(err);
        });
      });

      it('toggles inclusion in the list of likes if passed an agent object', done => {
        expect(image.likes.length).toEqual(0);
        // like
        image.toggleLiked(agent, (err, image) => {
          if (err) return done.fail(err);
          expect(image.likes.length).toEqual(1);
          expect(image.likes[0]).toEqual(agent._id);
          // unlike
          image.toggleLiked(agent, (err, image) => {
            if (err) return done.fail(err);
            expect(image.likes.length).toEqual(0);

            done();
          });
        });
      });

      it('toggles inclusion in the list of likes if passed an agent _id', done => {
        expect(image.likes.length).toEqual(0);
        // like
        image.toggleLiked(agent._id, (err, image) => {
          if (err) return done.fail(err);
          expect(image.likes.length).toEqual(1);
          expect(image.likes[0]).toEqual(agent._id);
          // unlike
          image.toggleLiked(agent._id, (err, image) => {
            if (err) return done.fail(err);
            expect(image.likes.length).toEqual(0);

            done();
          });
        });
      });
    });
  });
});
