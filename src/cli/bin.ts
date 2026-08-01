/**
 * Type generation executable
 *
 * @module cli/bin
 */

import { nodeIO } from './io.js';
import { run } from './run.js';

process.exitCode = run(process.argv.slice(2), nodeIO(console.log, console.error));
