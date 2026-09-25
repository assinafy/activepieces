#!/bin/sh
set -e

REF=$(cat ACTIVEPIECES_REF)
DIR=.activepieces

if [ "$(git -C "$DIR" rev-parse HEAD 2>/dev/null)" = "$REF" ]; then
  exit 0
fi

rm -rf "$DIR"
git init -q "$DIR"
git -C "$DIR" remote add origin https://github.com/activepieces/activepieces.git
git -C "$DIR" sparse-checkout set packages/pieces/framework packages/pieces/common packages/core/utils packages/core/piece-types
git -C "$DIR" fetch -q --depth 1 --filter=blob:none origin "$REF"
git -C "$DIR" checkout -q FETCH_HEAD
