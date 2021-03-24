document.addEventListener('DOMContentLoaded', function(event) {
  const supported = 'mediaDevices' in navigator;

  if (supported) {
    // Does this device have a camera?
    navigator.mediaDevices.enumerateDevices().then(function(devices) {
      if (devices.some(d => d.kind === 'videoinput')) {
        /**
         * Swap out basic image upload form
         */
        const section = document.querySelector('.deep-link');
        const defaultImageForm = section.innerHTML;
        section.innerHTML = `
          <div id="camera-button">
            <img src="/images/bpe-logo.png"><br>
            Add photos
          </div>
        `;

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

        const launchCameraButton = document.getElementById('camera-button');
        launchCameraButton.addEventListener('click', function(evt) {
          const constraints = {
            audio: false,
            video: true,
          };

          navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
            console.log('stream', stream);

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
            camera.remove();
          });
        });
      }
    }).catch(function(err) {
      console.error(err);
    });
  }
});

