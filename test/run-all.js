const { spawnSync } = require('child_process');
const steps = [['sim', 'test/sim.test.js'], ['net', 'test/net.test.js'], ['mobile', 'test/mobile.test.js']];
const only = process.argv[2]; let bad = 0;
for (const [n, f] of steps) {
  if (only && only !== n) continue;
  console.log('\n===== ' + n + ' =====');
  const r = spawnSync(process.execPath, [f], { stdio: 'inherit', cwd: require('path').join(__dirname, '..') });
  if (r.status !== 0) { bad++; console.log('>>> ' + n + ' FAILED'); }
}
console.log(bad ? '\n' + bad + ' suite(s) failed' : '\nALL SUITES PASSED'); process.exit(bad ? 1 : 0);
