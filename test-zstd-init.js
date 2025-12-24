const { ZstdInit } = require('@oneidentity/zstd-js');

async function test() {
  console.log('Testing if ZstdInit returns separate instances...\n');
  
  const codec1 = await ZstdInit();
  console.log('codec1 initialized');
  
  const codec2 = await ZstdInit();
  console.log('codec2 initialized\n');
  
  console.log('codec1 === codec2:', codec1 === codec2);
  console.log('codec1.ZstdSimple === codec2.ZstdSimple:', codec1.ZstdSimple === codec2.ZstdSimple);
  
  if (codec1 === codec2) {
    console.log('\n⚠️  WARNING: ZstdInit() returns the SAME instance (singleton)');
    console.log('This means our instance-based fix will NOT work!');
    console.log('We need to implement a global Zstd manager with locking.');
  } else {
    console.log('\n✅ ZstdInit() returns SEPARATE instances');
    console.log('Our instance-based fix should work correctly.');
  }
}

test().catch(console.error);

