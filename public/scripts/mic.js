document.addEventListener('DOMContentLoaded', function(event) {
  const supported = 'mediaDevices' in navigator;

  if (supported) {
    // Does this device have a mic?
    navigator.mediaDevices.enumerateDevices().then(function(devices) {

      // If mobile, it probably has at least a front and back camera
      devices = devices.filter(d => d.kind === 'audioinput');
      if (devices.length) {

        const mediaConstraints = {
          audio: true,
        };

        /**
         * Swap out basic image upload form for mic and launcher
         */
        const section = document.querySelector('.deep-link');
        const defaultUploadForm = section.innerHTML;
        section.innerHTML = `
          <div id="mic-button">
            <img src="/images/mic-logo.png"><br>
            Add photos
          </div>
          <div id="mic">
            <div id="spinner">Streaming...</div>
            <canvas id="visualizer"></canvas>
            <nav id="listener">
              <button id="send">Send</button>
              <button id="cancel">Cancel</button>
            </nav>
          </div>
        `;

        const launchMicButton = document.getElementById('mic-button');
        const mic = document.getElementById('mic');
//        const visualizer = document.getElementById('visualizer');
//        const context = visualizer.getContext('2d');
        const listener = document.getElementById('listener');
        const stop = document.getElementById('stop');
//        const sender = document.getElementById('sender');
//        const spinner = document.getElementById('spinner');
//
//        const cancel = document.getElementById('cancel');
//        // Cancel the option to send the photo
//        cancel.addEventListener('click', () => {
//          launchMic(mediaConstraints);
//        });
//
        const send = document.getElementById('send');
        // Send the audio to the server
        send.addEventListener('click', () => {

console.log('SENDING');
          spinner.style.display = 'block';
          send.style.display = 'none';
          cancel.style.display = 'none';


          let blob = new Blob(chunks, { type: 'ogg' });

//          visualizer.toBlob(function(blob) {
          const formData = new FormData();
          formData.append('docs', blob, 'blob.ogg');

//            spinner.style.display = 'block';
//            send.style.display = 'none';
//            cancel.style.display = 'none';
//
          fetch('/track', {
            method: 'POST',
            body: formData,
            redirect: 'manual',
            headers: {
              referer: window.location
            }
          })
          .then(res => {
            hideMic();
            // Automatically following redirect does not re-render the document
            window.location.href = res.url;
          });
//          }, 'image/jpeg', 0.8);
        });
//
//
//        const player = document.getElementById('player');

        // Initialized on app load
        let recorder, chunks, stream;

        // Stop all incoming streams
        function stopAllStreams() {
          try {
            recorder.stop();
          }
          catch (e) {
            // Just in case the stream is `inactive` or something
            console.error(e);
          }
          stream.getTracks().forEach(track => {
            stream.removeTrack(track);
            track.stop();
          });
          stream = null;
        };

//        const capture = document.getElementById('capture');
//        // Draw the video frame to the canvas.
//        capture.addEventListener('click', () => {
//          showPhotoViewer();
//          context.drawImage(player, 0, 0, visualizer.width, visualizer.height);
//          stopAllStreams();
//        });
//
//        // Reverse button is only relevant if there is more than one video input
//        const reverseButton = document.getElementById('reverse-camera');
//        reverseButton.setAttribute('aria-label', mediaConstraints.video.facingMode);
//        reverseButton.setAttribute('capture', mediaConstraints.video.facingMode);
//
//        if (devices.length > 1) {
//          reverseButton.addEventListener('click', function(evt) {
//            stopAllStreams();
//            mediaConstraints.video.facingMode = mediaConstraints.video.facingMode === 'environment' ? 'user': 'environment';
//
//            // More for testing than UX
//            reverseButton.setAttribute('aria-label', mediaConstraints.video.facingMode);
//            reverseButton.setAttribute('capture', mediaConstraints.video.facingMode);
//
//            launchMic(mediaConstraints);
//          });
//        }
//
        /**
         * Hide mic
         */
        function hideMic() {
          mic.style.display = 'none';
          visualizer.style.display = 'none';
          send.style.display = 'none';
          cancel.style.display = 'none';
        };

//        /**
//         * Show photo visualizer
//         */
//        function showPhotoViewer() {
//          // Make large DOM canvas and small style canvas
//          visualizer.width = player.videoWidth;
//          visualizer.height = player.videoHeight;
//
//          mic.style.display = 'block';
//          player.style.display = 'none';
//          listener.style.display = 'none';
//          capture.style.display = 'none';
//          visualizer.style.display = 'block';
//          sender.style.display = 'block';
//          reverseButton.style.display = 'none';
//        };
//
//        /**
//         * 2021-3-26
//         *
//         * It kind of seems like the `video` element and its associated
//         * APIs are a little picky. I'm not entirely certain on how to best
//         * destroy an element and its streams.
//         *
//         * Most internet lore speaks of this:
//         * https://stackoverflow.com/questions/3258587/how-to-properly-unload-destroy-a-video-element/40419032
//         *
//         * The camera behaves much better on desktop Chrome that it does in
//         * Android.
//         *
//         * Found the trick! https://github.com/twilio/twilio-video-app-react/issues/355#issuecomment-780368725
//         *
//         * It's a long-standing bug in Chrome.
//         */
//        // Close mic and return to app
//        const goBackButton = document.getElementById('go-back');
//        goBackButton.addEventListener('click', function cb(evt) {
//          stopAllStreams();
//          hideMic();
//        });
//

        // Close mic, stop stream, and return to app
        cancel.addEventListener('click', function cb(evt) {
          stopAllStreams();
          hideMic();
        });


        /**
         * The mic interface on launch
         */
        function setInitialMicState() {
          mic.style.display = 'block';
          listener.style.display = 'block';
          visualizer.style.display = 'block';
          send.style.display = 'block';
          cancel.style.display = 'block';
        };

        /**
         * Launch the mic
         *
         * @param Object - user media constraints
         */
        function launchMic(constraints) {

          navigator.mediaDevices.getUserMedia(constraints).then(function(s) {
            stream = s;

            // Attach the audio stream to a recorder
            recorder = new MediaRecorder(stream);

            recorder.start();

            recorder.ondataavailable = e => {
              console.log('Data received');
//              chunks.push(e.data);
//              if(recorder.state === 'inactive')  makeLink();
            };

            setInitialMicState();

          }).catch(function(err) {
            console.error(err);
            section.innerHTML = defaultUploadForm;
            mic.remove();
          });
        };

        launchMicButton.addEventListener('click', function(evt) {
          chunks = [];
          launchMic(mediaConstraints);
        });
      }
    }).catch(function(err) {
      console.error(err);
    });
  }
});

