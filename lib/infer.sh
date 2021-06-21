#!/bin/bash

if [ "$1" == "" ] || [ $# -gt 1 ]; then
  echo "usage: ./infer <filename>"
  exit 1
fi

if [[ ! -f $1 ]]; then
  echo "'$1' does not exist"
  exit 1
fi

BASEFILE=`basename $1`
OUTFILE="/tmp/${BASEFILE}.wav"

`rm $OUTFILE &> /dev/null`
`ffmpeg -i $1 -ar 16000 -ac 1 $OUTFILE &> /dev/null`

#echo $OUTFILE

OUTPUT=$(./flashlight/build/bin/asr/fl_asr_tutorial_inference_ctc \
  --am_path=am_transformer_ctc_stride3_letters_300Mparams.bin \
  --tokens_path=tokens.txt \
  --lexicon_path=lexicon.txt \
  --lm_path=lm_common_crawl_small_4gram_prun0-6-15_200kvocab.bin \
  --logtostderr=true \
  --sample_rate=16000 \
  --beam_size=50 \
  --beam_size_token=30 \
  --beam_threshold=100 \
  --lm_weight=1.5 \
  --word_score=0 \
  --audio_list=<(ls $OUTFILE) 2>&1 >/dev/null)

`rm $OUTFILE &> /dev/null`

while IFS= read -r line; do
  [[ ! $line =~ ^[A-Z][[:digit:]]{4}[[:space:]][[:digit:]]{1,2}:[[:digit:]]{2}:[[:digit:]]{2} ]] && [[ ! $line =~ --flagfile=\; ]] && echo $line
done <<< "$OUTPUT"
