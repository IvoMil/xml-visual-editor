#include "test_helper_data_fixtures.h"

// -- Regression: Unbounded choice propagates max_occurs to children --------

TEST_CASE("HelperDataService - Unbounded choice propagates cardinality to children",
          "[helper][elements][choice][regression]") {
    TestFixture f;
    f.Init(kUnboundedChoiceCardinalityXsd, kUnboundedChoiceCardinalityXml);

    auto result = f.Helper()->ComputeElementsPanelData(f.schema_id, "root", {"root"}, f.doc_id);
    REQUIRE(result.has_value());

    // Root has: sequence > choice(unbounded) > alpha, beta
    // Expect a single choice compositor node at top level
    REQUIRE(!result->content_model.empty());
    const auto& choice = result->content_model[0];
    CHECK(choice.node_type == "choice");
    CHECK(choice.max_occurs == kUnbounded);

    SECTION("Child elements inherit unbounded max_occurs from choice") {
        bool found_alpha = false, found_beta = false;
        for (const auto& child : choice.children) {
            if (child.name == "alpha") {
                CHECK(child.max_occurs == kUnbounded);
                found_alpha = true;
            }
            if (child.name == "beta") {
                CHECK(child.max_occurs == kUnbounded);
                found_beta = true;
            }
        }
        CHECK(found_alpha);
        CHECK(found_beta);
    }

    SECTION("Children with existing instances still show can_insert=true") {
        for (const auto& child : choice.children) {
            if (child.name == "alpha") {
                CHECK(child.current_count == 2);
                CHECK(child.can_insert);
                CHECK(!child.is_exhausted);
            }
            if (child.name == "beta") {
                CHECK(child.current_count == 1);
                CHECK(child.can_insert);
                CHECK(!child.is_exhausted);
            }
        }
    }

    SECTION("Choice itself is not exhausted") {
        CHECK(choice.current_count == 3);  // 2 alpha + 1 beta
        CHECK(choice.is_satisfied);
        CHECK(!choice.is_exhausted);
        CHECK(choice.can_insert);
    }
}

TEST_CASE("HelperDataService - Bounded choice does NOT propagate unbounded to children",
          "[helper][elements][choice]") {
    // Use the existing kChoiceXsd which has maxOccurs=1 (default)
    TestFixture f;
    f.Init(kChoiceXsd, kChoiceXml);

    auto result = f.Helper()->ComputeElementsPanelData(f.schema_id, "config", {"config"}, f.doc_id);
    REQUIRE(result.has_value());
    REQUIRE(!result->content_model.empty());

    const auto& choice = result->content_model[0];
    CHECK(choice.node_type == "choice");
    CHECK(choice.max_occurs == 1);

    SECTION("Children retain their own max_occurs (not promoted)") {
        for (const auto& child : choice.children) {
            CHECK(child.max_occurs == 1);
        }
    }

    SECTION("Active branch is exhausted with max=1 choice") {
        for (const auto& child : choice.children) {
            if (child.name == "fileSource") {
                CHECK(child.current_count == 1);
                // In max=1 choice, once a branch is selected, it's exhausted
            }
        }
    }
}

// -- Regression Bug L: Unbounded sequence propagates max_occurs to children --

TEST_CASE("HelperDataService - Unbounded sequence propagates cardinality to children",
          "[helper][elements][sequence][regression]") {
    TestFixture f;
    f.Init(kUnboundedSequenceCardinalityXsd, kUnboundedSequenceCardinalityXml);

    auto result = f.Helper()->ComputeElementsPanelData(f.schema_id, "enumerations", {"enumerations"}, f.doc_id);
    REQUIRE(result.has_value());
    REQUIRE(!result->content_model.empty());

    const auto& elem = result->content_model[0];
    CHECK(elem.node_type == "element");
    CHECK(elem.name == "enumeration");

    SECTION("Element inherits unbounded max_occurs from parent sequence") {
        CHECK(elem.max_occurs == kUnbounded);
    }

    SECTION("Element with 3 instances still allows insertion") {
        CHECK(elem.current_count == 3);
        CHECK(!elem.is_exhausted);
        CHECK(elem.can_insert);
    }

    SECTION("Element is satisfied (min_occurs=1, has 3)") {
        CHECK(elem.is_satisfied);
    }
}

// -- Regression Bug L: ComputeNodeDetails propagates unbounded sequence max_occurs --

TEST_CASE("ComputeNodeDetails propagates unbounded sequence max_occurs",
          "[helper][info][sequence][regression]") {
    TestFixture f;
    f.Init(kUnboundedSequenceCardinalityXsd, kUnboundedSequenceCardinalityXml);

    auto result =
        f.Helper()->ComputeNodeDetails(f.schema_id, "enumeration", {"enumerations", "enumeration"}, f.doc_id);
    REQUIRE(result.has_value());

    SECTION("max_occurs is unbounded (was incorrectly 1 before the fix)") {
        CHECK(result->max_occurs == kUnbounded);
    }

    SECTION("instance_state exists and element is not exhausted") {
        REQUIRE(result->instance_state.has_value());
        CHECK(result->instance_state->is_exhausted == false);
    }

    SECTION("can_insert is true for unbounded element") {
        REQUIRE(result->instance_state.has_value());
        CHECK(result->instance_state->can_insert == true);
    }
}
