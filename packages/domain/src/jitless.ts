import { z } from 'zod';

/**
 * Side-effect module: import it FIRST in an app entry. Zod decides per `z.object()` at schema
 * construction whether to compile a JIT parser, probing with `Function('')`; under a CSP without
 * 'unsafe-eval' (vercel.json) that probe is reported as a violation. Jitless parsing gives
 * identical results. It must run before any module that builds schemas is evaluated.
 */
z.config({ jitless: true });
