#include <pebble.h>

int main(void) {
  Window *w = window_create();
  window_stack_push(w, true);

  /*
   * The default Alloy pool is 32 KiB. JankTime2 loads several Poco bitmap
   * fonts (including the 56 px clock font) and a validated AppMessage receiver.
   * Reserve a bounded, explicit heap budget instead of letting the VM abort at
   * startup with "Alloy: Fatal Error — memory full".
   *
   * The total is 69,632 bytes; emery has 128 KiB app RAM shared with the
   * native window/Poco code. Re-check this allocation when fonts or modules
   * change, and keep a runtime screenshot smoke test in CI.
   */
  moddable_createMachine(&(ModdableCreationRecord){
    .recordSize = sizeof(ModdableCreationRecord),
    .stack = 5120,
    .slot = 36864,
    .chunk = 28672
  });

  window_destroy(w);
  return 0;
}
