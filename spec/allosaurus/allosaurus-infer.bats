@test "invoking ./allosaurus-infer without a file prints an error" {
  run ./allosaurus-infer.sh
  [ "$status" -eq 1 ]
  [ "$output" = "usage: ./allosaurus-infer <filename>" ]
}

@test "invoking ./allosaurus-infer with a non-existent file prints an error" {
  run ./allosaurus-infer.sh no/file/here.wav
  [ "$status" -eq 1 ]
  [ "$output" = "'no/file/here.wav' does not exist" ]
}

@test "./allosaurus-infer processes ideal wav files (16000 Hz, mono)" {
  run ./allosaurus-infer.sh tests/audio/hello-world.wav
  [ "$status" -eq 0 ]
  [ "$output" = "t̪ʰ ɨ l ɪ w ɹ̩ l d" ]
}

@test "./allosaurus-infer processes ideal ogg files (16000 Hz, mono)" {
  run ./allosaurus-infer.sh tests/audio/hello-world.ogg
  [ "$status" -eq 0 ]
  [ "$output" = "t̪ʰ ɨ l n w ɹ̩ l d" ]
}

@test "./allosaurus-infer processes Firefox recordings (oga, 48000 Hz, stereo)" {
  run ./allosaurus-infer.sh tests/audio/hello-world.oga
  [ "$status" -eq 0 ]
  [ "$output" = "tʂ o l ɨ" ]
}

@test "./allosaurus-infer processes Chrome recordings (weba, 48000 Hz, mono)" {
  run ./allosaurus-infer.sh tests/audio/hello-world.weba
  [ "$status" -eq 0 ]
  [ "$output" = "h ɛ l ə w ɹ̩ l d" ]
}

@test "./allosaurus-infer deletes converted file" {
  run ./allosaurus-infer.sh tests/audio/hello-world.weba

  if [[ -e /tmp/hello-world.weba.wav ]]; then
    echo "'/tmp/hello-world.weba.wav' still exists"
    exit 1
  fi
}

