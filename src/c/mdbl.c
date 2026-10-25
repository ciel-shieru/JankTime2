#include <pebble.h>

int main(void) {
  Window *w = window_create();
  window_stack_push(w, true);

  /*
   * The default Alloy pool is 32 KiB. JankTime2 loads Poco bitmap fonts,
   * including the clock font, and a bounded AppMessage receiver. Use the
   * documented explicit Moddable VM allocation instead of the default pool.
   *
   * Keep each heap within the SDK-supported range and total allocation bounded.
   * Re-check this budget when fonts or modules change.
   */
  moddable_createMachine(&(ModdableCreationRecord){
    .recordSize = sizeof(ModdableCreationRecord),
    .stack = 5120,
    .slot = 31744,
    .chunk = 19456
  });

  window_destroy(w);
  return 0;
}
