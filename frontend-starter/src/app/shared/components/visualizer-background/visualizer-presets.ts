/**
 * Hand-picked MilkDrop presets with smooth motion (no strobe). Each one is a separate JSON file of
 * ~7 kB, loaded on demand: importing the full butterchurn-presets pack would add ~12 MB.
 */
const PRESET_LOADERS: readonly (() => Promise<{ default: object }>)[] = [
  () => import('butterchurn-presets/presets/converted/Flexi - mindblob 2.0.json'),
  () => import('butterchurn-presets/presets/converted/Flexi + Rovastar - landing on Fractopia.json'),
  () => import('butterchurn-presets/presets/converted/Aderrasi - Potion of Spirits.json'),
  () => import('butterchurn-presets/presets/converted/Eo.S. - glowsticks v2 02.json'),
  () => import('butterchurn-presets/presets/converted/Eo.S. + Geiss - glowsticks v2 03 music shifter edit b (water mix).json'),
  () => import('butterchurn-presets/presets/converted/Cope - The Neverending Explosion of Red Liquid Fire.json'),
  () => import('butterchurn-presets/presets/converted/Flexi + Geiss - Tokamak mindblob 2.0.json'),
];

export async function loadPresets(): Promise<object[]> {
  const modules = await Promise.all(PRESET_LOADERS.map((load) => load()));
  return modules.map((module) => module.default);
}
