// Lightweight postinstall diagnostics — avoid modifying the user's environment.
function checkPkg(name) {
  try {
    require.resolve(name);
    console.log(`[postinstall-check] OK: ${name}`);
    return true;
  } catch (e) {
    console.warn(`[postinstall-check] MISSING: ${name} — run 'npm install ${name}' if you encounter build errors`);
    return false;
  }
}

checkPkg('uuid');
checkPkg('cookie');

console.log('[postinstall-check] Diagnostics complete. This script no longer attempts automatic repairs.');
