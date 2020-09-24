const fs = require('fs');

const MAX_IMGS = 30;

function filterFiles(path, done) {
  fs.readdir(path, (err, files) => {
    if (err) {
      return done(err);
    }

    files = files.filter(item => (/\.(gif|jpg|jpeg|tiff|png)$/i).test(item));

    done(null, files);
  });
}

module.exports = filterFiles;
