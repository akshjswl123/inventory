'use strict';

/**
 * Generate offline static seed files (same sources as SQL seeds).
 *
 *   node scripts/generateStaticSeedCatalog.js
 *
 * Writes static_seed_core.js, static_seed_materials.js, scoop_config_catalog.js,
 * and static_seed_catalog.js via generateOfflineSeedStatic.js.
 */

require('./generateOfflineSeedStatic.js');
