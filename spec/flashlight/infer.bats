@test "invoking ./infer without a file prints an error" {
  run ./infer.sh
  [ "$status" -eq 1 ]
  [ "$output" = "usage: ./infer <filename>" ]
}

@test "invoking ./infer with a non-existent file prints an error" {
  run ./infer.sh no/file/here.wav
  [ "$status" -eq 1 ]
  [ "$output" = "'no/file/here.wav' does not exist" ]
}

@test "./infer processes ideal wav files (16000 Hz, mono)" {
  run ./infer.sh tests/audio/hello-world.wav
  [ "$status" -eq 0 ]
  [ "$output" = "hello world" ]
}

@test "./infer processes ideal ogg files (16000 Hz, mono)" {
  run ./infer.sh tests/audio/hello-world.ogg
  [ "$status" -eq 0 ]
  [ "$output" = "hello world" ]
}

@test "./infer processes Firefox recordings (oga, 48000 Hz, stereo)" {
  run ./infer.sh tests/audio/hello-world.oga
  [ "$status" -eq 0 ]
  [ "$output" = "hello world" ]
}

@test "./infer processes Chrome recordings (weba, 48000 Hz, mono)" {
  run ./infer.sh tests/audio/hello-world.weba
  [ "$status" -eq 0 ]
  [ "$output" = "hello world" ]
}

@test "./infer deletes converted file" {
  run ./infer.sh tests/audio/hello-world.weba

  if [[ -e /tmp/hello-world.weba.wav ]]; then
    echo "'/tmp/hello-world.weba.wav' still exists"
    exit 1
  fi
}

