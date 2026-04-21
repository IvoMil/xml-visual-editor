// Shared helpers for unit tests that load fixture files from the repo's
// resources/ directory. These helpers tolerate fixtures that are absent in
// the public repo (excluded via .publicignore), allowing the affected
// TEST_CASEs to WARN and skip instead of failing.

#pragma once

#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>

namespace xve::test {

// Walk upward from the current working directory looking for a fixture path
// relative to the repo root (e.g. "resources/sample_files/foo.xml"). Returns
// an empty path if not found within `max_depth` parents. ctest typically runs
// from build/*/core, so we need to climb out of the build tree to the repo
// root.
inline auto FindFixture(const std::filesystem::path& relative, int max_depth = 10) -> std::filesystem::path {
    auto dir = std::filesystem::current_path();
    for (int i = 0; i < max_depth; ++i) {
        if (std::filesystem::exists(dir / relative)) {
            return dir / relative;
        }
        if (!dir.has_parent_path() || dir.parent_path() == dir) break;
        dir = dir.parent_path();
    }
    return {};
}

// Read the entire file at `path` into a string. Returns empty string if the
// file is absent or unreadable.
inline auto ReadFileToString(const std::filesystem::path& path) -> std::string {
    if (path.empty()) return {};
    std::ifstream in(path, std::ios::binary);
    if (!in.good()) return {};
    std::stringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

}  // namespace xve::test
