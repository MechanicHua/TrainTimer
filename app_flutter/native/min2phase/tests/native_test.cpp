#include "traintimer_min2phase.h"
#include "../src/facelet_moves.h"

#include <atomic>
#include <cstring>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <thread>
#include <vector>

namespace {
const std::string solved = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
int failures = 0;
void check(bool value, const char* message) {
    if (!value) { ++failures; std::cerr << "FAIL: " << message << '\n'; }
}
int solve(const std::string& current, const std::string& target, char* output, int* steps, int budget = 100000000) {
    return tt_m2p_solve(current.data(), current.size(), target.data(), target.size(), budget, output, 64, steps, nullptr);
}
}

int main(int argc, char** argv) {
    check(tt_m2p_abi_version() == 1, "ABI version");
    check(tt_m2p_validate(nullptr, 54) == 1, "null input");
    check(tt_m2p_validate(solved.data(), 53) == 1, "short input");
    check(tt_m2p_validate(solved.data(), 55) == 1, "long input");
    check(tt_m2p_validate(solved.data(), 54) == 0, "solved validation");
    auto invalid = solved;
    invalid[0] = '\0';
    check(tt_m2p_validate(invalid.data(), 54) == 1, "embedded NUL rejected");
    invalid = solved;
    std::swap(invalid[5], invalid[10]);
    check(tt_m2p_validate(invalid.data(), 54) == 3, "single flipped edge rejected");
    invalid = solved;
    char corner = invalid[8]; invalid[8] = invalid[9]; invalid[9] = invalid[20]; invalid[20] = corner;
    check(tt_m2p_validate(invalid.data(), 54) == 5, "single corner twist rejected");
    invalid = solved;
    std::swap(invalid[10], invalid[19]);
    check(tt_m2p_validate(invalid.data(), 54) == 6, "edge parity rejected");
    invalid = solved;
    std::swap(invalid[4], invalid[13]);
    check(tt_m2p_validate(invalid.data(), 54) == 1, "moved centers rejected");
    check(tt_m2p_initialize() == 0 && tt_m2p_initialize() == 0, "idempotent initialization");

    char output[64] = "stale";
    int steps = -1;
    check(solve(solved, solved, output, &steps) == 0 && !output[0] && steps == 0, "equal states return empty solution");
    check(solve(invalid, solved, output, &steps) == TT_M2P_INVALID_CURRENT && !output[0] && steps == 0, "invalid current clears outputs");
    check(solve(solved, invalid, output, &steps) == TT_M2P_INVALID_TARGET, "invalid target");
    check(solve(solved, solved, output, &steps, 0) == TT_M2P_INVALID_ARGUMENT, "invalid budget");
    check(tt_m2p_solve(solved.data(), 54, solved.data(), 54, 1, output, 63, nullptr, nullptr) == TT_M2P_INVALID_ARGUMENT, "small output buffer rejected");
    check(tt_m2p_solve(solved.data(), 54, solved.data(), 54, 1, nullptr, 64, nullptr, nullptr) == TT_M2P_INVALID_ARGUMENT, "null output rejected");
    const std::string budget_current = "DLRRUUDDRFRBFRUFDUFBUBFRDFLRDDFDRUULBBRULLBLBUDLBBLFFL";
    const std::string budget_target = "RLRFURFUDFUUFRDFFBDBRLFRLRUBBLLDDBRDBLLULDUUUFBDBBFLDR";
    check(solve(budget_current, budget_target, output, &steps, 1) == TT_M2P_BUDGET_EXHAUSTED && !output[0] && steps == 0,
        "budget exhaustion returns no unverified or oversized fallback");

    for (int face = 0; face < 6; ++face) {
        auto state = solved;
        traintimer::turn(state, face, 4);
        check(state == solved, "four quarter turns are identity");
        traintimer::turn(state, face, 1);
        check(tt_m2p_validate(state.data(), 54) == 0, "quarter turn remains legal");
        traintimer::turn(state, face, 3);
        check(state == solved, "inverse turn returns solved");
    }

    std::atomic<int> concurrent_failures{0};
    std::vector<std::thread> workers;
    for (int worker = 0; worker < 8; ++worker) workers.emplace_back([worker, &concurrent_failures] {
        for (int i = 0; i < 20; ++i) {
            auto current = solved, target = solved;
            traintimer::turn(current, worker % 6, 1);
            traintimer::turn(current, (worker + 1) % 6, 2);
            traintimer::turn(target, (worker + 2) % 6, 3);
            char moves[64]; int count = 0;
            if (solve(current, target, moves, &count) != 0 || count > 20) ++concurrent_failures;
        }
    });
    for (auto& worker : workers) worker.join();
    check(concurrent_failures == 0, "160 calls across eight threads serialized and verified");
    if (argc == 3) {
        std::ifstream input(argv[1]);
        std::ofstream result(argv[2]);
        check(input.good() && result.good(), "regression fixture and output accessible");
        result << "id\tstatus\tsteps\tms\tmoves\n" << std::setprecision(12);
        std::string line;
        int count = 0;
        while (std::getline(input, line)) {
            auto first = line.find('\t'), second = line.find('\t', first + 1);
            check(first != std::string::npos && second != std::string::npos, "fixture fields valid");
            if (first == std::string::npos || second == std::string::npos) break;
            auto id = line.substr(0, first), current = line.substr(first + 1, second - first - 1), target = line.substr(second + 1);
            char moves[64]; int32_t move_count = 0; double ms = 0;
            int status = tt_m2p_solve(current.data(), current.size(), target.data(), target.size(),
                100000000, moves, 64, &move_count, &ms);
            check(status == 0 && move_count <= 20, id.c_str());
            result << id << '\t' << status << '\t' << move_count << '\t' << ms << '\t' << moves << '\n';
            ++count;
        }
        check(count == 1506, "all 1506 fixture states completed");
        std::cout << "regression cases=" << count << '\n';
    }
    std::cout << "native ABI tests: " << (failures ? "FAIL" : "PASS") << ", failures=" << failures << '\n';
    return failures ? 1 : 0;
}
