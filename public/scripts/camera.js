document.addEventListener('DOMContentLoaded', function(event) {
  const supported = 'mediaDevices' in navigator;

  if (supported) {
    // Does this device have a camera?
    navigator.mediaDevices.enumerateDevices().then(function(devices) {

      // If mobile, it probably has at least a front and back camera
      devices = devices.filter(d => d.kind === 'videoinput');
      if (devices.length) {

        const mediaConstraints = {
          audio: false,
          video: {
            facingMode: 'environment'
          }
        };

        /**
         * Swap out basic image upload form...
         */
        const section = document.querySelector('.deep-link');
        const defaultImageForm = section.innerHTML;
        section.innerHTML = `
          <div id="camera-button">
            <img src="/images/bpe-logo.png"><br>
            Add photos
          </div>
        `;
        const launchCameraButton = document.getElementById('camera-button');

        // ... for camera and components
        section.insertAdjacentHTML('afterend', `
          <div id="camera">
            <video id="player" autoplay></video>
            <canvas id="viewer"></canvas>
            <nav id="shooter">
              <button id="reverse-camera">Reverse</button>
              <button id="capture">Capture</button>
              <button id="go-back">Back</button>
            </nav>
            <nav id="sender">
              <button id="send">Send</button>
              <button id="cancel">Cancel</button>
            </nav>
          </div>
        `);

        const camera = document.getElementById('camera');

        /**
         * Launch the camera
         *
         * @param Object - user media constraints
         */
        function launchCamera(constraints) {
          navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {

            const player = document.getElementById('player');
            const viewer = document.getElementById('viewer');
            const shooter = document.getElementById('shooter');
            const sender = document.getElementById('sender');
            const context = viewer.getContext('2d');

            // Reverse button is only relevant if there is more than one video input
            const reverseButton = document.getElementById('reverse-camera');
            reverseButton.setAttribute('aria-label', mediaConstraints.video.facingMode);
            reverseButton.setAttribute('capture', mediaConstraints.video.facingMode);

            if (devices.length > 1) {
              function reverseHandler(evt) {
                player.srcObject.getVideoTracks().forEach(track => track.stop());
                mediaConstraints.video.facingMode = mediaConstraints.video.facingMode === 'environment' ? 'user': 'environment';
                reverseButton.removeEventListener('click', reverseHandler);
                launchCameraButton.click();
              }
              reverseButton.addEventListener('click', reverseHandler);
            }

            /**
             *
             */
            function setInitialCameraState() {
              camera.style.display = 'block';
              player.style.display = 'block';
              shooter.style.display = 'block';
              viewer.style.display = 'none';
              sender.style.display = 'none';

              if (devices.length > 1) {
                reverseButton.style.display = 'block';
              }
              else {
                reverseButton.style.display = 'none';
              }
            };

//            const captureButton = document.getElementById('capture');
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
            camera.remove();
          });
        };

        launchCameraButton.addEventListener('click', function(evt) {
          launchCamera(mediaConstraints);
        });
      }
    }).catch(function(err) {
      console.error(err);
    });
  }
});

