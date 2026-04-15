export const debugPause = (
  connectionUri: string,
  minutes = 10,
): Promise<void> => {
  return new Promise((resolve) => {
    console.log('\n──────────────────────────────────────');
    console.log('DEBUG PAUSE — connect via pgAdmin:');
    console.log(connectionUri);
    console.log(`Resuming in ${minutes} minutes. Press any key to continue...`);
    console.log('──────────────────────────────────────\n');

    const timer = setTimeout(resolve, minutes * 60 * 1000);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.once('data', () => {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        clearTimeout(timer);
        resolve();
      });
    }
  });
};
