#ifndef TRAINTIMER_MIN2PHASE_H
#define TRAINTIMER_MIN2PHASE_H

#include <stddef.h>
#include <stdint.h>

#if defined(_WIN32)
# if defined(TT_M2P_BUILD)
#  define TT_M2P_API __declspec(dllexport)
# else
#  define TT_M2P_API __declspec(dllimport)
# endif
#else
# define TT_M2P_API __attribute__((visibility("default")))
#endif

#ifdef __cplusplus
extern "C" {
#endif

enum tt_m2p_status {
    TT_M2P_OK = 0,
    TT_M2P_INVALID_ARGUMENT = 1,
    TT_M2P_INVALID_CURRENT = 2,
    TT_M2P_INVALID_TARGET = 3,
    TT_M2P_BUDGET_EXHAUSTED = 4,
    TT_M2P_VERIFICATION_FAILED = 5,
    TT_M2P_INTERNAL_ERROR = 6
};

TT_M2P_API uint32_t tt_m2p_abi_version(void);
TT_M2P_API int32_t tt_m2p_initialize(void);
/* Exactly 54 ASCII facelets, URFDLB order and fixed URFDLB centers.
 * Returns 0 valid; 1 malformed; 2 missing edge; 3 edge orientation;
 * 4 missing corner; 5 corner orientation; 6 permutation parity; -1 exception.
 * Does not initialize coordinate tables. */
TT_M2P_API int32_t tt_m2p_validate(const char* facelets, size_t length);
/* output_capacity must be >= 64; output is NUL terminated, at most 20 HTM.
 * probe_max must be 1..100000000. This is a search-node budget, not a deadline.
 * Call on a background worker. Shared initialization and search are serialized.
 * Output is published only after independent facelet permutation verification.
 * On failure output is empty, steps = 0; elapsed_ms includes lock wait + init.
 * No pointers are retained. All pointers must refer to valid caller-owned storage.
 * Buffers must not overlap; steps/elapsed_ms may be NULL. No C++ exception escapes.
 */
TT_M2P_API int32_t tt_m2p_solve(
    const char* current, size_t current_length,
    const char* target, size_t target_length,
    int32_t probe_max, char* output, size_t output_capacity,
    int32_t* steps, double* elapsed_ms);

#ifdef __cplusplus
}
#endif
#endif
