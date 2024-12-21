import { Sync } from './sync.ts';

(async (): Promise<void> => {
  await Sync.do();
})();
