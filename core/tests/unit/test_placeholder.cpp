#include <catch2/catch_test_macros.hpp>

namespace xve {
auto version() -> const char*;
}

TEST_CASE("Core - version returns valid string", "[core][version]") {
    const auto* ver = xve::version();
    REQUIRE(ver != nullptr);
    CHECK(std::string(ver) == "0.1.0");
}
