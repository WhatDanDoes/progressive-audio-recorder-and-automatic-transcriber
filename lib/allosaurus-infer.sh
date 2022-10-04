#!/bin/bash

if [ "$1" == "" ] || [ $# -gt 1 ]; then
  echo "usage: ./allosaurus-infer <filename>"
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

OUTPUT=$(python -m allosaurus.run -i $OUTFILE)

`rm $OUTFILE &> /dev/null`

echo "$OUTPUT"

