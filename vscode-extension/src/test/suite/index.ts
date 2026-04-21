import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 10000 });
  const testsRoot = path.resolve(__dirname, '.');
  const gridViewRoot = path.resolve(__dirname, '../grid-view');

  return new Promise((resolve, reject) => {
    Promise.all([
      glob('**/**.test.js', { cwd: testsRoot }),
      glob('**/**.test.js', { cwd: gridViewRoot }).catch(() => [] as string[]),
    ])
      .then(([suiteFiles, gridViewFiles]) => {
        suiteFiles.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));
        gridViewFiles.forEach((f) => mocha.addFile(path.resolve(gridViewRoot, f)));
        mocha.run((failures) => {
          if (failures > 0) {
            reject(new Error(`${failures} tests failed.`));
          } else {
            resolve();
          }
        });
      })
      .catch(reject);
  });
}
