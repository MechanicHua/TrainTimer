#include "traintimer_min2phase.h"
#include "facelet_moves.h"
#include "Search.h"

#include <chrono>
#include <cstring>
#include <mutex>
#include <sstream>

namespace {
using Clock = std::chrono::steady_clock;
std::mutex solver_mutex;
bool initialized = false;
constexpr char faces[] = "URFDLB";

void initialize_locked() {
    if (initialized) return;
    min2phase::info::init();
    min2phase::coords::init();
    initialized = true;
}

int validate(const char* data, size_t size, min2phase::CubieCube& cube) {
    if (!data || size != 54) return 1;
    int counts[6]{};
    int8_t colors[54]{};
    for (int i = 0; i < 54; ++i) {
        const char* color = std::strchr(faces, data[i]);
        if (!color || color == faces + 6) return 1;
        colors[i] = static_cast<int8_t>(color - faces);
        ++counts[colors[i]];
    }
    for (int face = 0; face < 6; ++face) if (counts[face] != 9 || data[face * 9 + 4] != faces[face]) return 1;
    min2phase::CubieCube::toCubieCube(colors, cube);
    // Conversion must preserve every sticker. Upstream's converter defaults missing
    // pieces to zero; never allow those defaults to mask malformed piece colors.
    if (min2phase::CubieCube::toFaceCube(cube) != std::string(data, size)) return 1;
    return static_cast<int>(cube.check());
}

min2phase::CubieCube multiply(const min2phase::CubieCube& a, const min2phase::CubieCube& b) {
    min2phase::CubieCube product;
    min2phase::CubieCube::edgeMult(a, b, product);
    min2phase::CubieCube::cornMult(a, b, product);
    return product;
}

struct Elapsed {
    Clock::time_point start;
    double* output;
    ~Elapsed() { if (output) *output = std::chrono::duration<double, std::milli>(Clock::now() - start).count(); }
};
}

extern "C" {
uint32_t tt_m2p_abi_version(void) { return 1; }

int32_t tt_m2p_initialize(void) {
    try {
        std::lock_guard<std::mutex> guard(solver_mutex);
        initialize_locked();
        return TT_M2P_OK;
    } catch (...) { return TT_M2P_INTERNAL_ERROR; }
}

int32_t tt_m2p_validate(const char* facelets, size_t length) {
    try {
        min2phase::CubieCube cube;
        return validate(facelets, length, cube);
    } catch (...) { return -1; }
}

int32_t tt_m2p_solve(const char* current, size_t current_length,
                     const char* target, size_t target_length,
                     int32_t probe_max, char* output, size_t output_capacity,
                     int32_t* steps, double* elapsed_ms) {
    Elapsed elapsed{Clock::now(), elapsed_ms};
    if (output && output_capacity) output[0] = '\0';
    if (steps) *steps = 0;
    if (!output || output_capacity < 64 || probe_max < 1 || probe_max > 100000000) return TT_M2P_INVALID_ARGUMENT;
    try {
        min2phase::CubieCube c, t;
        if (validate(current, current_length, c)) return TT_M2P_INVALID_CURRENT;
        if (validate(target, target_length, t)) return TT_M2P_INVALID_TARGET;
        std::string current_text(current, current_length), target_text(target, target_length);
        if (current_text == target_text) return TT_M2P_OK;
        // One executor owns initialization and each mutable Search instance.
        std::lock_guard<std::mutex> guard(solver_mutex);
        initialize_locked();
        t.inv();
        const auto relative = min2phase::CubieCube::toFaceCube(multiply(t, c));
        const auto solution = min2phase::Search().solve(relative, 20, probe_max, 0, 0, nullptr);
        if (solution == "7" || solution == "8") return TT_M2P_BUDGET_EXHAUSTED;

        std::istringstream tokens(solution);
        std::string token, normalized, verified = current_text;
        int count = 0;
        while (tokens >> token) {
            if (token.empty() || token.size() > 2 || ++count > 20) return TT_M2P_VERIFICATION_FAILED;
            const char* face = std::strchr(faces, token[0]);
            if (!face || face == faces + 6) return TT_M2P_VERIFICATION_FAILED;
            int quarters = 1;
            if (token.size() == 2) {
                if (token[1] == '2') quarters = 2;
                else if (token[1] == '\'') quarters = 3;
                else return TT_M2P_VERIFICATION_FAILED;
            }
            traintimer::turn(verified, static_cast<int>(face - faces), quarters);
            if (!normalized.empty()) normalized += ' ';
            normalized += token;
        }
        if (verified != target_text || normalized.size() + 1 > output_capacity) return TT_M2P_VERIFICATION_FAILED;
        std::memcpy(output, normalized.c_str(), normalized.size() + 1);
        if (steps) *steps = count;
        return TT_M2P_OK;
    } catch (...) { return TT_M2P_INTERNAL_ERROR; }
}
}
