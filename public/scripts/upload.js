document.addEventListener('DOMContentLoaded', function(event) {
  var input = document.getElementById('tracks-input');
  var form = document.getElementById('tracks-form');

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

