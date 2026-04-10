#include "xmlvisualeditor/schema/schema_types.h"

#include <catch2/catch_test_macros.hpp>

using namespace xve;

TEST_CASE("Schema types - ElementInfo defaults and comparisons", "[schema_types]") {
    SECTION("ElementInfo default values") {
        ElementInfo e;
        CHECK(e.min_occurs == 1);
        CHECK(e.max_occurs == 1);
        CHECK(e.nillable == false);
        CHECK(e.is_abstract == false);
        CHECK(e.choice_path.empty());
    }

    SECTION("kUnbounded constant") {
        CHECK(kUnbounded == -1);
    }

    SECTION("Comparison operators") {
        ElementInfo a;
        a.name = "x";
        ElementInfo b = a;
        REQUIRE(a == b);
        b.name = "y";
        CHECK(!(a == b));
    }
}
