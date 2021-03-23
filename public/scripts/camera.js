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
        var defaultImageForm = section.innerHTML;
        section.innerHTML = `
          <div id="camera-button">
            <img src="/images/bpe-logo.png"><br>
            Add photos
          </div>
          <video id="player" controls autoplay></video>
          <canvas id="canvas" width=320 height=240></canvas>
        `;

        section.addEventListener('click', function(evt) {
console.log('evt');
console.log(evt);
          //const player = document.getElementById('player');

          const constraints = {
            audio: false,
            video: true,
          };

          navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
            section.insertAdjacentHTML =
            console.log('stream', stream);

            const player = document.getElementById('player');
            const canvas = document.getElementById('canvas');
            const context = canvas.getContext('2d');
            const captureButton = document.getElementById('capture');

//            const constraints = {
//              video: true,
//            };

//            captureButton.addEventListener('click', () => {
//              // Draw the video frame to the canvas.
//              context.drawImage(player, 0, 0, canvas.width, canvas.height);
//            });

            // Attach the video stream to the video element and autoplay.
            player.srcObject = stream;

          }).catch(function(err) {
            console.error(err);
            section.innerHTML = defaultImageForm;
          });
        });
      }
    }).catch(function(err) {
      console.error(err);
    });
  }
});

