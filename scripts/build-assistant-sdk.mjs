import {build} from 'esbuild';
import {copyFile} from 'node:fs/promises';
await build({entryPoints:['scripts/cloudbase-entry.js'],outfile:'dist/vendor/cloudbase.mjs',bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,legalComments:'linked'});
await copyFile('node_modules/@cloudbase/js-sdk/LICENSE','dist/vendor/cloudbase-LICENSE.txt');
