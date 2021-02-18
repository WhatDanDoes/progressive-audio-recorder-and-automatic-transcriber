document.addEventListener('DOMContentLoaded', function(event) {
  var input = document.getElementById('photos-input');
  var form = document.getElementById('photos-form');

  if (input) {
    input.addEventListener('change', function() {
      if (input.files.length > 0) {
        form.submit(function() {
          console.log('Submitting');
        });
      }
    });
  }
});

