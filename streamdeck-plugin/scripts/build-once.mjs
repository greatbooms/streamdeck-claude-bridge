import { rollup } from "rollup";
import config from "../rollup.config.mjs";

const bundle = await rollup(config);
try {
  await bundle.write(config.output);
} finally {
  await bundle.close();
}

// In this environment Rollup writes successfully but leaves a close request
// pending, so make the one-shot build command terminate after successful close.
process.exit(0);
