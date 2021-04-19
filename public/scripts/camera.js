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
            facingMode: 'environment',
            width: { ideal: 4096 },
            height: { ideal: 2160 }
          }
        };

        /**
         * Swap out basic image upload form for camera and launcher
         */
        const section = document.querySelector('.deep-link');
        const defaultImageForm = section.innerHTML;
        section.innerHTML = `
          <div id="camera-button">
            <img src="/images/bpe-logo.png"><br>
            Add photos
          </div>
          <div id="camera">
            <div id="spinner">Sending...</div>
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
        `;

        const launchCameraButton = document.getElementById('camera-button');
        const camera = document.getElementById('camera');
        const viewer = document.getElementById('viewer');
        const context = viewer.getContext('2d');
        const shooter = document.getElementById('shooter');
        const sender = document.getElementById('sender');
        const spinner = document.getElementById('spinner');

        const cancel = document.getElementById('cancel');
        // Cancel the option to send the photo
        cancel.addEventListener('click', () => {
          launchCamera(mediaConstraints);
        });

        const send = document.getElementById('send');
        // Send the photo to the server
        send.addEventListener('click', () => {
          viewer.toBlob(function(blob) {
            const formData = new FormData();
            formData.append('docs', blob, 'blob.jpg');

            spinner.style.display = 'block';
            send.style.display = 'none';
            cancel.style.display = 'none';

            fetch('/image', {
              method: 'POST',
              body: formData,
              redirect: 'manual',
              headers: {
                referer: window.location
              }
            })
            .then(res => {
              hideCamera();
              // Automatically following redirect does not re-render the document
              window.location.href = res.url;
            });
          }, 'image/jpeg', 0.8);
        });


        const player = document.getElementById('player');
        // Stop all incoming streams
        function stopAllStreams() {
          player.srcObject.getTracks().forEach(track => {
            player.srcObject.removeTrack(track);
            track.stop();
          });
          player.srcObject = null;
        }

        const capture = document.getElementById('capture');
        // Draw the video frame to the canvas.
        capture.addEventListener('click', () => {
          showPhotoViewer();
          context.drawImage(player, 0, 0, viewer.width, viewer.height);
          stopAllStreams();
        });

        // Reverse button is only relevant if there is more than one video input
        const reverseButton = document.getElementById('reverse-camera');
        reverseButton.setAttribute('aria-label', mediaConstraints.video.facingMode);
        reverseButton.setAttribute('capture', mediaConstraints.video.facingMode);

        if (devices.length > 1) {
          reverseButton.addEventListener('click', function(evt) {
            stopAllStreams();
            mediaConstraints.video.facingMode = mediaConstraints.video.facingMode === 'environment' ? 'user': 'environment';

            // More for testing than UX
            reverseButton.setAttribute('aria-label', mediaConstraints.video.facingMode);
            reverseButton.setAttribute('capture', mediaConstraints.video.facingMode);

            launchCamera(mediaConstraints);
          });
        }

        /**
         * Hide camera
         */
        function hideCamera() {
          camera.style.display = 'none';
          player.style.display = 'none';
          shooter.style.display = 'none';
          capture.style.display = 'none';
          viewer.style.display = 'none';
          sender.style.display = 'none';
          reverseButton.style.display = 'none';
          spinner.style.display = 'none';
        };

        /**
         * Show photo viewer
         */
        function showPhotoViewer() {
          // Make large DOM canvas and small style canvas
          viewer.width = player.videoWidth;
          viewer.height = player.videoHeight;

          camera.style.display = 'block';
          player.style.display = 'none';
          shooter.style.display = 'none';
          capture.style.display = 'none';
          viewer.style.display = 'block';
          sender.style.display = 'block';
          reverseButton.style.display = 'none';
        };

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
         *
         * Found the trick! https://github.com/twilio/twilio-video-app-react/issues/355#issuecomment-780368725
         *
         * It's a long-standing bug in Chrome.
         */
        // Close camera and return to app
        const goBackButton = document.getElementById('go-back');
        goBackButton.addEventListener('click', function cb(evt) {
          stopAllStreams();
          hideCamera();
        });

        /**
         * The camera interface on launch
         */
        function setInitialCameraState() {
          camera.style.display = 'block';
          player.style.display = 'block';
          shooter.style.display = 'block';
          capture.style.display = 'block';
          viewer.style.display = 'none';
          sender.style.display = 'none';
          spinner.style.display = 'none';

          if (devices.length > 1) {
            reverseButton.style.display = 'block';
          }
          else {
            reverseButton.style.display = 'none';
          }
        };

        /**
         * Launch the camera
         *
         * @param Object - user media constraints
         */
        function launchCamera(constraints) {

          navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {

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

