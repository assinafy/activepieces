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

# Keep TLS verification, response-body deadlines and private request bodies.
node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
const path = '.activepieces/packages/pieces/common/src/lib/http/core/fetch-http-client.ts';
const source = readFileSync(path, 'utf8');
const patched = source
  .replace(/^\s*process\.env\['NODE_TLS_REJECT_UNAUTHORIZED'\] = '0';\r?\n/m, '')
  .replace(/^\s*console\.error\('\[HttpClient#\(sanitized error message\)\] Request failed:', httpError\);\r?\n/m, '')
  .replace(
    /      const controller = new AbortController\(\);\n      const timeoutId = request\.timeout && request\.timeout > 0\n        \? setTimeout\(\(\) => controller\.abort\(\), request\.timeout\)\n        : undefined;\n      try \{([\s\S]*?)      \} finally \{\n        if \(timeoutId !== undefined\) \{\n          clearTimeout\(timeoutId\);\n        \}\n      \}/,
    (_, body) => `      const signal = request.timeout && request.timeout > 0\n        ? AbortSignal.timeout(request.timeout)\n        : undefined;\n${body.replace('signal: controller.signal', 'signal').replace(/^  /gm, '')}`.trimEnd()
  );
writeFileSync(path, patched);
NODE
