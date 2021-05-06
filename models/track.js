'use strict';

module.exports = function(mongoose) {
  const Schema = mongoose.Schema;
  const arrayUniquePlugin = require('mongoose-unique-array');

  const TrackSchema = new Schema({
    path: {
      type: String,
      trim: true,
      required: [true, 'No path supplied'],
      unique: true,
      empty: [false, 'No path supplied'],
      validate: {
        isAsync: true,
        validator: function(v, cb) {
          if (!this.isNew) return cb();
          this.model('Track').count({ path: v }).then(count => {
            cb(!count);
          });
        },
        message: 'Track file name collision'
      }
    },
    recordist: {
      type: Schema.Types.ObjectId,
      ref: 'Agent',
      required: [true, 'Who recorded the track?'],
    },
    likes: [{
      type: Schema.Types.ObjectId,
      ref: 'Agent',
    }],
    flagged: {
      type: Boolean,
      default: false
    },
    flaggers: [{
      type: Schema.Types.ObjectId,
      ref: 'Agent',
    }],
    published: {
      type: Schema.Types.Date,
      default: null
    },
    notes: [{
      author: {
        type: Schema.Types.ObjectId,
        ref: 'Agent',
        required: [true, 'Who wrote the note?'],
      },
      text: {
        type: Schema.Types.String,
        trim: true,
        required: [true, 'Empty note not saved'],
        maxlength: [500, 'That note is too long (max 500 characters)'],
      }
    }],
    transcription: {
      type: Schema.Types.String,
      default: '',
      trim: true,
      maxlength: [1000000, 'That note is too long (max 1000000 characters)'],
    },
    name: {
      type: Schema.Types.String,
      default: '',
      trim: true,
      maxlength: [128, 'That name is too long (max 128 characters)'],
    },
  }, {
    timestamps: true
  });

  TrackSchema.methods.toggleFlagged = function(done) {
    this.flagged = !this.flagged;
    this.save((err, track) => {
      if (err) {
        return done(err);
      }
      done(null, track);
    });
  };

  TrackSchema.methods.togglePublished = function(done) {
    this.published = this.published ? null : new Date();
    this.save((err, track) => {
      if (err) {
        return done(err);
      }
      done(null, track);
    });
  };

  TrackSchema.methods.toggleLiked = function(agentId, done) {
    if (typeof agentId === 'object') {
      agentId = agentId._id
    }

    const likeIndex = this.likes.indexOf(agentId);
    if (likeIndex > -1 ) {
      this.likes.splice(agentId, 1);
    }
    else {
      this.likes.push(agentId);
    }

    this.save((err, track) => {
      if (err) {
        return done(err);
      }
      done(null, track);
    });
  };

  TrackSchema.methods.flag = function(agentId, done) {
    if (typeof agentId === 'object') {
      agentId = agentId._id
    }

    const flagIndex = this.flaggers.indexOf(agentId);
    if (flagIndex > -1) {
      this.flaggers.splice(agentId, 1);
    }
    this.flaggers.push(agentId);

    this.flagged = this.flaggers.length > 0;

    this.save((err, track) => {
      if (err) {
        return done(err);
      }
      done(null, track);
    });
  };

  return TrackSchema;
};

