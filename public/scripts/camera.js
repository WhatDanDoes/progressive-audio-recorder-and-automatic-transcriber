document.addEventListener('DOMContentLoaded', function(event) {
  const supported = 'mediaDevices' in navigator;

  if (supported) {
    // Does this device have a camera?
    navigator.mediaDevices.enumerateDevices().then(function(devices) {
      if (devices.some(d => d.kind === 'videoinput')) {
        /**
         * Swap out basic image upload form
         */
        var section = document.querySelector('.deep-link');
        section.innerHTML = '<div id="camera-button"><img src="/images/bpe-logo.png"><br>Add photos</div>';

        section.addEventListener('click', evt => {
          console.log(evt);
        });
      }
    }).catch(function(err) {
      console.error(err);
    });
  }
});

