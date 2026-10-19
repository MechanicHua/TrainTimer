#ifndef TT_FACELET_MOVES_H
#define TT_FACELET_MOVES_H

#include <array>
#include <cstring>
#include <string>

namespace traintimer {
// Geometric sticker permutations, independent of the solver's cubie arithmetic.
// Face coordinates follow the existing TrainTimer cube-state.js conventions.
struct Vector {
    int x, y, z;
    bool operator==(const Vector& b) const { return x == b.x && y == b.y && z == b.z; }
};
struct Sticker { Vector position, normal; };
inline Vector rotate(Vector v, int axis) {
    if (axis == 0) return {v.x, -v.z, v.y};
    if (axis == 1) return {v.z, v.y, -v.x};
    return {-v.y, v.x, v.z};
}
inline std::array<Sticker, 54> geometry() {
    const Vector normals[] = {{0,1,0}, {1,0,0}, {0,0,1}, {0,-1,0}, {-1,0,0}, {0,0,-1}};
    std::array<Sticker, 54> result{};
    for (int face = 0; face < 6; ++face) {
        for (int row = 0; row < 3; ++row) for (int col = 0; col < 3; ++col) {
            int a = col - 1, b = row - 1;
            Vector p{};
            switch (face) {
                case 0: p = {a,1,b}; break;
                case 1: p = {1,-b,-a}; break;
                case 2: p = {a,-b,1}; break;
                case 3: p = {a,-1,-b}; break;
                case 4: p = {-1,-b,a}; break;
                case 5: p = {-a,-b,-1}; break;
            }
            result[face * 9 + row * 3 + col] = {p, normals[face]};
        }
    }
    return result;
}
inline const std::array<std::array<int, 54>, 6>& permutations() {
    static const auto result = [] {
        auto stickers = geometry();
        std::array<std::array<int, 54>, 6> moves{};
        const int axes[] = {1,0,2,1,0,2};
        for (int face = 0; face < 6; ++face) for (int i = 0; i < 54; ++i) {
            auto sticker = stickers[i];
            int axis = axes[face], layer = face < 3 ? 1 : -1;
            int position = axis == 0 ? sticker.position.x : axis == 1 ? sticker.position.y : sticker.position.z;
            if (position == layer) for (int q = 0; q < (layer == 1 ? 3 : 1); ++q) {
                sticker.position = rotate(sticker.position, axis);
                sticker.normal = rotate(sticker.normal, axis);
            }
            for (int j = 0; j < 54; ++j) if (sticker.position == stickers[j].position && sticker.normal == stickers[j].normal) {
                moves[face][i] = j;
                break;
            }
        }
        return moves;
    }();
    return result;
}
inline void turn(std::string& state, int face, int quarters) {
    const auto& permutation = permutations()[face];
    while (quarters-- > 0) {
        char previous[54];
        std::memcpy(previous, state.data(), 54);
        for (int i = 0; i < 54; ++i) state[permutation[i]] = previous[i];
    }
}
}
#endif
