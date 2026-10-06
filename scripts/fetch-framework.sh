#!/bin/sh
set -e

REF=$(cat ACTIVEPIECES_REF)
DIR=.activepieces

if [ "$(git -C "$DIR" rev-parse HEAD 2>/dev/null)" != "$REF" ]; then
  rm -rf "$DIR"
  git init -q "$DIR"
  git -C "$DIR" remote add origin https://github.com/activepieces/activepieces.git
  git -C "$DIR" sparse-checkout set packages/pieces/framework packages/pieces/common packages/core/utils packages/core/piece-types
  git -C "$DIR" fetch -q --depth 1 --filter=blob:none origin "$REF"
  git -C "$DIR" checkout -q FETCH_HEAD
fi

# Preserve Node's TLS certificate verification for every bundled HTTP call.
node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
const path = '.activepieces/packages/pieces/common/src/lib/http/core/fetch-http-client.ts';
const source = readFileSync(path, 'utf8');
writeFileSync(path, source.replace(/^\s*process\.env\['NODE_TLS_REJECT_UNAUTHORIZED'\] = '0';\r?\n/m, ''));
NODE
