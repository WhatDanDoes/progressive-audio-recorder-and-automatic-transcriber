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
          <div id="camera">
            <video id="player" autoplay></video>
            <canvas id="viewer"></canvas>
            <nav id="shooter"></nav>
            <nav id="sender"></nav>
          </div>
        `;

        section.addEventListener('click', function(evt) {
          const constraints = {
            audio: false,
            video: true,
          };

          navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
            console.log('stream', stream);

            const camera = document.getElementById('camera');
            const player = document.getElementById('player');
            const viewer = document.getElementById('viewer');
            const shooter = document.getElementById('shooter');
            const sender = document.getElementById('sender');
            const context = viewer.getContext('2d');
//            const captureButton = document.getElementById('capture');

            function setInitialCameraState() {
              camera.style.display = 'block';
              player.style.display = 'block';
              shooter.style.display = 'block';
              viewer.style.display = 'none';
              sender.style.display = 'none';
            }

//            const constraints = {
//              video: true,
//            };

//            captureButton.addEventListener('click', () => {
//              // Draw the video frame to the canvas.
//              context.drawImage(player, 0, 0, canvas.width, canvas.height);
//            });

            // Attach the video stream to the video element and autoplay.
            player.srcObject = stream;

            setInitialCameraState();

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

