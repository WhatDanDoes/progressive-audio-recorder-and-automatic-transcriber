document.addEventListener('DOMContentLoaded', function(event) {
  const supported = 'mediaDevices' in navigator;

  if (supported) {
    // Does this device have a mic?
    navigator.mediaDevices.enumerateDevices().then(function(devices) {

      // If mobile, it probably has at least a front and back camera
      devices = devices.filter(d => d.kind === 'audioinput');
      if (devices.length) {

        const wave = new Wave();

        /**
         * Swap out basic image upload form for mic and launcher
         */
        const section = document.querySelector('.deep-link');
        const defaultUploadForm = section.innerHTML;
        section.innerHTML = `
          <div id="mic-button">
            <img src="/images/mic-logo.png"><br>
            Record audio
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
        const listener = document.getElementById('listener');
        const stop = document.getElementById('stop');
        const spinner = document.getElementById('spinner');
        const visualizer = document.getElementById('visualizer');
        const cancel = document.getElementById('cancel');

        const send = document.getElementById('send');
        // Send the audio to the server
        let sendWasClicked = false;
        send.addEventListener('click', () => {
          sendWasClicked = true;
          spinner.style.display = 'block';
          send.style.display = 'none';
          cancel.style.display = 'none';

          stopAllStreams();
        });

        // Initialized on app load
        let recorder, chunks, stream;

        // Stop all incoming streams
        function stopAllStreams() {
          wave.stopStream();
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

        /**
         * Hide mic
         */
        function hideMic() {
          mic.style.display = 'none';
          visualizer.style.display = 'none';
          send.style.display = 'none';
          cancel.style.display = 'none';
        };

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

            recorder.onstart = e => {
              console.log('Recording started');

              // Audio visualization
              wave.fromStream(stream, 'visualizer', { type: 'wave' });
            };

            recorder.onstop = e => {
              console.log('Recording stopped');
            };

            recorder.ondataavailable = e => {
              console.log('Data received');
              chunks.push(e.data);

              if (recorder.state === 'inactive' && sendWasClicked) {
                console.log('inactive');
                console.log(chunks.length);

                //let blob = new Blob(chunks);
                let blob = new Blob(chunks, { type: chunks[0].type });
                console.log(blob);

                const formData = new FormData();
                formData.append('docs', blob);

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

              }
            };

            recorder.start();
            setInitialMicState();
          }).catch(function(err) {
            console.error(err);
            section.innerHTML = defaultUploadForm;
            mic.remove();
          });
        };

        launchMicButton.addEventListener('click', function(evt) {
          sendWasClicked = false;
          chunks = [];
          launchMic({ audio: true });
        });
      }
    }).catch(function(err) {
      console.error(err);
    });
  }
});

