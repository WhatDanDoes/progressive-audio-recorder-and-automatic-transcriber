document.addEventListener('DOMContentLoaded', function(event) {
  var supported = 'mediaDevices' in navigator;

  if (supported) {
    // Does this device have a camera?
    navigator.mediaDevices.enumerateDevices().then(function(devices) {
      if (devices.some(d => d.kind === 'videoinput')) {
        /**
         * Swap out basic image upload form
         */
        var section = document.querySelector('.deep-link');
        section.innerHTML = `
          <div id="camera-button">
            <img src="/images/bpe-logo.png"><br>
            Add photos
          </div>
        `;

        section.addEventListener('click', function(evt) {
          //const player = document.getElementById('player');

          const constraints = {
            audio: false,
            video: true,
          };

          navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
            //player.srcObject = stream;
            console.log('stream', stream);
          }).catch(function(err) {
            console.error(err);
          });
        });
      }
    }).catch(function(err) {
      console.error(err);
    });
  }
});

