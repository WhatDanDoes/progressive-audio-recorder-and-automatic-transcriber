'use strict';

module.exports = function(mongoose) {
  const Schema = mongoose.Schema;
  const arrayUniquePlugin = require('mongoose-unique-array');

  const ImageSchema = new Schema({
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
          this.model('Image').count({ path: v }).then(count => {
            cb(!count);
          });
        },
        message: 'Image file name collision'
      }
    },
    photographer: {
      type: Schema.Types.ObjectId,
      ref: 'Agent',
      required: [true, 'Who took the picture?'],
    },
    likes: [{
      type: Schema.Types.ObjectId,
      ref: 'Agent',
    }],
    flagged: {
      type: Boolean,
      default: false
    },
    published: {
      type: Boolean,
      default: false
    }
  }, {
    timestamps: true
  });


  ImageSchema.methods.toggleFlagged = function(done) {
    this.flagged = !this.flagged;
    this.save((err, image) => {
      if (err) {
        return done(err);
      }
      done(null, image);
    });
  };

  ImageSchema.methods.togglePublished = function(done) {
    this.published = !this.published;
    this.save((err, image) => {
      if (err) {
        return done(err);
      }
      done(null, image);
    });
  };

  ImageSchema.methods.toggleLiked = function(agentId, done) {
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

    this.save((err, image) => {
      if (err) {
        return done(err);
      }
      done(null, image);
    });
  };




  return ImageSchema;
};

