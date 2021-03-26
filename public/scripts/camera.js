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
         * Swap out basic image upload form for camera launcher
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

        /**
         * Launch the camera
         *
         * @param Object - user media constraints
         */
        function launchCamera(constraints) {

          // The camera and its components
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

          navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
            const player = document.getElementById('player');
            // Stop all incoming video streams
            function stopAllStreams() {
              player.srcObject.getTracks().forEach(track => track.stop());
            }

            const viewer = document.getElementById('viewer');
            const context = viewer.getContext('2d');
            const shooter = document.getElementById('shooter');
            const sender = document.getElementById('sender');
            const capture = document.getElementById('capture');

            /**
             * 2021-3-26
             *
             * It kind of seems like the `video` element and its associated
             * APIs are a little picky. I'm not entirely certain on how to best
             * destroy an element and its streams.
             *
             * Most internet lore speaks of this:
             * https://stackoverflow.com/questions/3258587/how-to-properly-unload-destroy-a-video-element/40419032
             *
             * The camera behaves much better on desktop Chrome that it does in
             * Android.
             */
            // Close camera and return to app
            const goBackButton = document.getElementById('go-back');
            goBackButton.addEventListener('click', function cb(evt) {
              console.log('Go back!');
              // What follows is guesswork and sorcery...
              stopAllStreams();
              player.pause();
              player.srcObject = null;
              player.load();
              // This is probably unecessary. I'm just trying to erase every
              // trace of the the video element so it works better on Android.
              player.remove();
              camera.remove();

              evt.currentTarget.removeEventListener(event.type, cb);
            }, { once: true });

            // Reverse button is only relevant if there is more than one video input
            const reverseButton = document.getElementById('reverse-camera');
            reverseButton.setAttribute('aria-label', mediaConstraints.video.facingMode);
            reverseButton.setAttribute('capture', mediaConstraints.video.facingMode);

            if (devices.length > 1) {
              function reverseHandler(evt) {
                stopAllStreams();
                mediaConstraints.video.facingMode = mediaConstraints.video.facingMode === 'environment' ? 'user': 'environment';
                evt.currentTarget.removeEventListener('click', reverseHandler);
                camera.remove();
                launchCameraButton.click();
              }
              reverseButton.addEventListener('click', reverseHandler, { once: true });
            }

            /**
             * This should be unnecessary, as it is set in the styles.
             * Can't get tests to pass without explicitly setting them.
             */
            function setInitialCameraState() {
              camera.style.display = 'block';
              player.style.display = 'block';
              shooter.style.display = 'block';
              capture.style.display = 'block';
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

