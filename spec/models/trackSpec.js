'use strict';

describe('Track', () => {
  const _profile = require('../fixtures/sample-auth0-profile-response');

  const db = require('../../models');
  const Track = db.Track;

  let track, agent;

  beforeEach(done => {
    db.Agent.create(_profile).then(obj => {
      agent = obj;
      track = new Track({ path: 'audio.ogg', recordist: agent });
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
      expect(track.createdAt).toBe(undefined);
      expect(track.updatedAt).toBe(undefined);
      track.save().then(obj => {
        expect(track.createdAt instanceof Date).toBe(true);
        expect(track.updatedAt instanceof Date).toBe(true);
        done();
      }).catch(err => {
        done.fail(err);
      });
    });

    it('does not allow two identical paths', done => {
      track.save().then(obj => {
        Track.create({ path: 'audio.ogg', recordist: agent }).then(obj => {
          done.fail('This should not have saved');
        }).catch(error => {
          expect(Object.keys(error.errors).length).toEqual(1);
          expect(error.errors['path'].message).toEqual('Track file name collision');
          done();
        });
      }).catch(error => {
        done.fail(error);
      });
    });

    it('does not allow an empty path field', done => {
      Track.create({ path: ' ', recordist: agent }).then(obj => {
        done.fail('This should not have saved');
      }).catch(error => {
        expect(Object.keys(error.errors).length).toEqual(1);
        expect(error.errors['path'].message).toEqual('No path supplied');
        done();
      });
    });

    it('does not allow an undefined path field', done => {
      Track.create({ recordist: agent }).then(obj => {
        done.fail('This should not have saved');
      }).catch(error => {
        expect(Object.keys(error.errors).length).toEqual(1);
        expect(error.errors['path'].message).toEqual('No path supplied');
        done();
      });
    });

    it('requires a recordist credit', done => {
      track.recordist = undefined;
      expect(track.recordist).toBe(undefined);
      track.save().then(obj => {
        done.fail('This should not have saved');
      }).catch(error => {
        expect(Object.keys(error.errors).length).toEqual(1);
        expect(error.errors['recordist'].message).toEqual('Who recorded the track?');
        done();
      });
    });

    it('sets the default fields to their default values', done => {
      expect(track.flagged).toBe(false);
      expect(track.flaggers).toEqual([]);
      expect(track.published).toEqual(null);
      expect(track.likes).toEqual([]);
      expect(track.transcription).toEqual('');
      expect(track.name).toEqual('');
      track.save().then(obj => {
        expect(track.flagged).toBe(false);
        expect(track.flaggers).toEqual([]);
        expect(track.published).toEqual(null);
        expect(track.likes).toEqual([]);
        expect(track.notes).toEqual([]);
        expect(track.transcription).toEqual('');
        expect(track.name).toEqual('');
        done();
      }).catch(error => {
        done.fail(error);
      });
    });

    describe('name field', () => {
      it('returns an error if string exceeds max length', done => {
        // Max length
        track.name = 'd'.repeat(128);
        track.save().then(obj => {
          expect(track.name).toEqual('d'.repeat(128));

          // Too long!
          track.name = 'd'.repeat(129);
          track.save().then(obj => {
            done.fail('Should not get here');
          }).catch(error => {
            expect(error.message).toMatch(/That name is too long \(max 128 characters\)/);
            done();
          });
        }).catch(error => {
          done.fail(error);
        });
      });
    });

    describe('notes field', () => {
      it('saves a note and the author agent\'s _id', done => {
        track.notes.push({ author: agent._id, text: 'd'.repeat(500) });
        track.save().then(obj => {
          expect(track.notes.length).toEqual(1);
          expect(track.notes[0].author).toEqual(agent._id);
          expect(track.notes[0].text).toEqual('d'.repeat(500));
          done();
        }).catch(error => {
          done.fail(error);
        });
      });

      it('does not allow notes of over 500 characters', done => {
        track.notes.push({ author: agent._id, text: 'd'.repeat(501) });
        track.save().then(obj => {
          done.fail('This should not have saved');
        }).catch(error => {
          expect(Object.keys(error.errors).length).toEqual(1);
          expect(error.errors['notes.0.text'].message).toEqual('That note is too long (max 500 characters)');

          done();
        });
      });

      it('does not allow empty notes', done => {
        track.notes.push({ author: agent._id, text: '   ' });
        track.save().then(obj => {
          done.fail('This should not have saved');
        }).catch(error => {
          expect(Object.keys(error.errors).length).toEqual(1);
          expect(error.errors['notes.0.text'].message).toEqual('Empty note not saved');
          done();
        });
      });

      it('does not allow undefined notes', done => {
        track.notes.push({ author: agent._id });
        track.save().then(obj => {
          done.fail('This should not have saved');
        }).catch(error => {
          expect(Object.keys(error.errors).length).toEqual(1);
          expect(error.errors['notes.0.text'].message).toEqual('Empty note not saved');
          done();
        });
      });

      it('requires an author', done => {
        track.notes.push({ text: 'Paperback writer, wriiiiiter...' });
        track.save().then(obj => {
          done.fail('This should not have saved');
        }).catch(error => {
          expect(Object.keys(error.errors).length).toEqual(1);
          expect(error.errors['notes.0.author'].message).toEqual('Who wrote the note?');
          done();
        });
      });

      it('allows multiple notes', done => {
        track.notes.push({ author: agent._id, text: 'My favourite animal is the beefalo' });
        track.save().then(obj => {
          expect(track.notes.length).toEqual(1);
          track.notes.push({ author: agent._id, text: 'My favourite colour is brown' });
          track.save().then(obj => {
            expect(track.notes.length).toEqual(2);
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
        expect(track.flagged).toBe(false);
        expect(track.flaggers).toEqual([]);
        // on
        track.toggleFlagged((err, track) => {
          if (err) return done.fail(err);
          expect(track.flagged).toBe(true);
          expect(track.flaggers).toEqual([]);
          // off
          track.toggleFlagged((err, track) => {
            if (err) return done.fail(err);
            expect(track.flagged).toBe(false);
            expect(track.flaggers).toEqual([]);
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

      it('adds agent to list of agents who flagged this track idempotently', done => {
        expect(track.flagged).toBe(false);
        expect(track.flaggers.length).toEqual(0);
        // flag
        track.flag(agent, (err, track) => {
          if (err) return done.fail(err);
          expect(track.flagged).toBe(true);
          expect(track.flaggers.length).toEqual(1);
          expect(track.flaggers[0]).toEqual(agent._id);
          // flag again
          track.flag(agent, (err, track) => {
            if (err) return done.fail(err);
            expect(track.flagged).toBe(true);
            expect(track.flaggers.length).toEqual(1);
            expect(track.flaggers[0]).toEqual(agent._id);

            done();
          });
        });
      });

      it('adds agent to list of agents who flagged this track idempotently if passed an agent _id', done => {
        expect(track.flagged).toBe(false);
        expect(track.flaggers.length).toEqual(0);
        // flag
        track.flag(agent._id, (err, track) => {
          if (err) return done.fail(err);
          expect(track.flagged).toBe(true);
          expect(track.flaggers.length).toEqual(1);
          expect(track.flaggers[0]).toEqual(agent._id);
          // flag again
          track.flag(agent._id, (err, track) => {
            if (err) return done.fail(err);
            expect(track.flagged).toBe(true);
            expect(track.flaggers.length).toEqual(1);
            expect(track.flaggers[0]).toEqual(agent._id);

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
        expect(track.published).toEqual(null);
        // on
        track.togglePublished((err, track) => {
          if (err) return done.fail(err);
          expect(track.published instanceof Date).toBe(true);
          // off
          track.togglePublished((err, track) => {
            if (err) return done.fail(err);
            expect(track.published).toEqual(null);
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
        expect(track.likes.length).toEqual(0);
        // like
        track.toggleLiked(agent, (err, track) => {
          if (err) return done.fail(err);
          expect(track.likes.length).toEqual(1);
          expect(track.likes[0]).toEqual(agent._id);
          // unlike
          track.toggleLiked(agent, (err, track) => {
            if (err) return done.fail(err);
            expect(track.likes.length).toEqual(0);

            done();
          });
        });
      });

      it('toggles inclusion in the list of likes if passed an agent _id', done => {
        expect(track.likes.length).toEqual(0);
        // like
        track.toggleLiked(agent._id, (err, track) => {
          if (err) return done.fail(err);
          expect(track.likes.length).toEqual(1);
          expect(track.likes[0]).toEqual(agent._id);
          // unlike
          track.toggleLiked(agent._id, (err, track) => {
            if (err) return done.fail(err);
            expect(track.likes.length).toEqual(0);

            done();
          });
        });
      });
    });
  });
});
