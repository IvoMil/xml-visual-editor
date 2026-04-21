#include "test_helper_data_fixtures.h"

// -- Elements Panel Data ---------------------------------------------------

TEST_CASE("HelperDataService - Elements panel data", "[helper][elements]") {
    TestFixture f;
    f.Init(kTestXsd, kTestXml);

    SECTION("Returns content model for root with instance state") {
        auto result = f.Helper()->ComputeElementsPanelData(f.schema_id, "root", {"root"}, f.doc_id);
        REQUIRE(result.has_value());
        CHECK(result->anchor_element == "root");

        // root has 4 children in schema: title, description, item, footer
        REQUIRE(result->content_model.size() >= 3);

        // Find specific nodes
        bool found_title = false, found_item = false;
        for (const auto& node : result->content_model) {
            if (node.name == "title") {
                CHECK(node.node_type == "element");
                CHECK(node.current_count == 1);
                CHECK(node.is_satisfied);
                found_title = true;
            }
            if (node.name == "item") {
                CHECK(node.node_type == "element");
                CHECK(node.current_count == 2);
                CHECK(node.is_satisfied);   // min=1, have 2
                CHECK(!node.is_exhausted);  // max=unbounded
                CHECK(node.can_insert);
                found_item = true;
            }
        }
        CHECK(found_title);
        CHECK(found_item);
    }

    SECTION("Missing required elements detected") {
        // Document with only title - missing item (required min=1)
        auto& doc = *f.container.GetDocumentService();
        auto mini_id = doc.OpenDocumentFromString(R"(<?xml version="1.0"?><root version="1"><title>T</title></root>)");
        REQUIRE(!mini_id.empty());

        auto result = f.Helper()->ComputeElementsPanelData(f.schema_id, "root", {"root"}, mini_id);
        REQUIRE(result.has_value());
        CHECK(!result->content_complete);
        CHECK(!result->missing_required.empty());

        bool item_missing = false;
        for (const auto& m : result->missing_required) {
            if (m == "item")
                item_missing = true;
        }
        CHECK(item_missing);
    }

    SECTION("Content complete when all required present") {
        auto result = f.Helper()->ComputeElementsPanelData(f.schema_id, "root", {"root"}, f.doc_id);
        REQUIRE(result.has_value());
        CHECK(result->content_complete);
        CHECK(result->missing_required.empty());
    }

    SECTION("Schema-only mode (no doc_id) returns zero counts") {
        auto result = f.Helper()->ComputeElementsPanelData(f.schema_id, "root", {}, "");
        REQUIRE(result.has_value());
        for (const auto& node : result->content_model) {
            CHECK(node.current_count == 0);
        }
    }

    SECTION("Returns empty panel for unknown element (no content model)") {
        auto result = f.Helper()->ComputeElementsPanelData(f.schema_id, "nonexistent", {}, "");
        REQUIRE(result.has_value());
        CHECK(result->content_model.empty());
        CHECK(result->content_complete);
    }

    SECTION("Nested element content model (item has name + value)") {
        auto result = f.Helper()->ComputeElementsPanelData(f.schema_id, "item", {"root", "item"}, f.doc_id);
        if (result.has_value()) {
            // item has sequence: name (required), value (optional)
            bool found_name = false;
            for (const auto& node : result->content_model) {
                if (node.name == "name") {
                    CHECK(node.min_occurs == 1);
                    found_name = true;
                }
            }
            CHECK(found_name);
        }
    }
}

// -- Choice Exclusion ------------------------------------------------------

TEST_CASE("HelperDataService - Choice exclusion", "[helper][elements][choice]") {
    TestFixture f;
    f.Init(kChoiceXsd, kChoiceXml);

    SECTION("Active choice branch identified") {
        auto result = f.Helper()->ComputeElementsPanelData(f.schema_id, "config", {"config"}, f.doc_id);
        REQUIRE(result.has_value());

        // Should have one choice compositor node
        REQUIRE(!result->content_model.empty());
        const auto& choice = result->content_model[0];
        CHECK(choice.node_type == "choice");
        CHECK(choice.active_branch == "fileSource");
    }

    SECTION("Inactive branches marked can_insert=false for exclusive choice") {
        auto result = f.Helper()->ComputeElementsPanelData(f.schema_id, "config", {"config"}, f.doc_id);
        REQUIRE(result.has_value());
        REQUIRE(!result->content_model.empty());

        const auto& choice = result->content_model[0];
        for (const auto& child : choice.children) {
            if (child.name == "fileSource") {
                CHECK(child.current_count == 1);
            } else {
                // dbSource, apiSource should not be insertable
                CHECK(!child.can_insert);
            }
        }
    }
}

// -- Embedded Choice in Sequence ------------------------------------------

TEST_CASE("HelperDataService - Embedded choice in sequence grouped correctly", "[helper][elements][choice]") {
    TestFixture f;
    f.Init(kEmbeddedChoiceXsd, kEmbeddedChoiceXml);

    SECTION("Single choice node for all alternatives") {
        auto result = f.Helper()->ComputeElementsPanelData(f.schema_id, "importRun", {"importRun"}, f.doc_id);
        REQUIRE(result.has_value());

        // Expect 3 top-level nodes: general, (choice), externUnit
        REQUIRE(result->content_model.size() == 3);
        CHECK(result->content_model[0].node_type == "element");
        CHECK(result->content_model[0].name == "general");
        CHECK(result->content_model[1].node_type == "choice");
        CHECK(result->content_model[2].node_type == "element");
        CHECK(result->content_model[2].name == "externUnit");

        // The choice node should have all 4 alternatives as children
        const auto& choice = result->content_model[1];
        REQUIRE(choice.children.size() == 4);
        CHECK(choice.children[0].name == "timeSeriesSet");
        CHECK(choice.children[1].name == "temporary");
        CHECK(choice.children[2].name == "locationId");
        CHECK(choice.children[3].name == "locationSetId");
    }

    SECTION("Active branch detection in embedded choice") {
        auto result = f.Helper()->ComputeElementsPanelData(f.schema_id, "importRun", {"importRun"}, f.doc_id);
        REQUIRE(result.has_value());
        REQUIRE(result->content_model.size() >= 2);

        const auto& choice = result->content_model[1];
        CHECK(choice.node_type == "choice");
        CHECK(choice.active_branch == "timeSeriesSet");

        // timeSeriesSet should have current_count == 1
        bool found = false;
        for (const auto& child : choice.children) {
            if (child.name == "timeSeriesSet") {
                CHECK(child.current_count == 1);
                found = true;
            }
        }
        CHECK(found);
    }
}

// -- Empty Content Model --------------------------------------------------

TEST_CASE("HelperDataService - Empty content model", "[helper][elements]") {
    TestFixture f;
    f.Init(kEmptyXsd, nullptr);

    SECTION("Empty complexType returns empty content_model") {
        auto result = f.Helper()->ComputeElementsPanelData(f.schema_id, "marker", {}, "");
        REQUIRE(result.has_value());
        CHECK(result->content_model.empty());
    }
}

TEST_CASE("HelperDataService - Unbounded embedded choice has correct occurrence", "[helper][elements][choice]") {
    TestFixture f;
    f.Init(kUnboundedChoiceXsd, kUnboundedChoiceXml);

    auto result = f.Helper()->ComputeElementsPanelData(f.schema_id, "workflow", {"workflow"}, f.doc_id);
    REQUIRE(result.has_value());

    // Expect: description (element), choice (compositor), completed (element)
    REQUIRE(result->content_model.size() == 3);
    CHECK(result->content_model[0].name == "description");
    CHECK(result->content_model[0].node_type == "element");

    const auto& choice = result->content_model[1];
    CHECK(choice.node_type == "choice");

    SECTION("Choice has correct occurrence info") {
        CHECK(choice.min_occurs == 1);
        CHECK(choice.max_occurs == -1);  // kUnbounded
    }

    SECTION("Unbounded choice is not exhausted after one instance") {
        CHECK(choice.current_count == 1);  // one activity instance
        CHECK(choice.is_satisfied);        // min=1 met
        CHECK(!choice.is_exhausted);       // unbounded can't exhaust
        CHECK(choice.can_insert);          // still insertable
    }

    SECTION("Active branch identified but all branches remain insertable") {
        CHECK(choice.active_branch == "activity");
    }

    SECTION("Completed element after choice") {
        CHECK(result->content_model[2].name == "completed");
        CHECK(result->content_model[2].node_type == "element");
    }
}

TEST_CASE("HelperDataService - Choice with all-optional branches is content_complete",
           "[helper][elements][choice]") {
    TestFixture f;
    f.Init(kAllOptionalChoiceXsd, kAllOptionalChoiceXml);

    SECTION("content_complete is true when no choice branch selected") {
        auto result =
            f.Helper()->ComputeElementsPanelData(f.schema_id, "container", {"container"}, f.doc_id);
        REQUIRE(result.has_value());
        CHECK(result->content_complete);
    }

    SECTION("Choice node is_satisfied with zero total and all-optional branches") {
        auto result =
            f.Helper()->ComputeElementsPanelData(f.schema_id, "container", {"container"}, f.doc_id);
        REQUIRE(result.has_value());

        // Expect: name (element), choice (compositor), footer (element)
        REQUIRE(result->content_model.size() == 3);
        const auto& choice = result->content_model[1];
        CHECK(choice.node_type == "choice");
        CHECK(choice.current_count == 0);
        CHECK(choice.is_satisfied);
    }
}

// -- min_occurs preserved in optional choice (regression) ------------------

TEST_CASE("HelperDataService - min_occurs preserved for elements in optional choice",
          "[helper][elements][choice][regression]") {
    TestFixture f;
    f.Init(kOptChoiceMinOccursXsd, kOptChoiceMinOccursXml);

    SECTION("Choice child elements have min_occurs == 1") {
        auto result = f.Helper()->ComputeElementsPanelData(f.schema_id, "root", {"root"}, f.doc_id);
        REQUIRE(result.has_value());
        REQUIRE(!result->content_model.empty());

        // Expect a choice compositor node
        const auto& choice = result->content_model[0];
        CHECK(choice.node_type == "choice");
        CHECK(choice.min_occurs == 0);  // the choice itself is optional

        // Both child elements must retain min_occurs == 1
        bool found_a = false, found_b = false;
        for (const auto& child : choice.children) {
            if (child.name == "optA") {
                CHECK(child.min_occurs == 1);
                found_a = true;
            }
            if (child.name == "optB") {
                CHECK(child.min_occurs == 1);
                found_b = true;
            }
        }
        CHECK(found_a);
        CHECK(found_b);
    }

    SECTION("Schema-only mode also preserves min_occurs") {
        auto result = f.Helper()->ComputeElementsPanelData(f.schema_id, "root", {}, "");
        REQUIRE(result.has_value());
        REQUIRE(!result->content_model.empty());

        const auto& choice = result->content_model[0];
        CHECK(choice.node_type == "choice");
        for (const auto& child : choice.children) {
            if (child.name == "optA" || child.name == "optB") {
                CHECK(child.min_occurs == 1);
            }
        }
    }
}

// -- Choice with default minOccurs (XSD default = 1) shows required ----------

TEST_CASE("HelperDataService - Choice without explicit minOccurs defaults to required",
          "[helper][elements][choice]") {
    TestFixture f;
    f.Init(kDefaultMinOccursChoiceXsd, kDefaultMinOccursChoiceXml);

    SECTION("Choice node has min_occurs=1 (XSD default)") {
        auto result =
            f.Helper()->ComputeElementsPanelData(f.schema_id, "settings", {"settings"}, f.doc_id);
        REQUIRE(result.has_value());

        // Expect: name (element), choice (compositor), footer (element)
        REQUIRE(result->content_model.size() == 3);
        const auto& choice = result->content_model[1];
        CHECK(choice.node_type == "choice");
        CHECK(choice.min_occurs == 1);
        CHECK(choice.max_occurs == 1);
    }

    SECTION("Choice is not satisfied when no branch selected") {
        auto result =
            f.Helper()->ComputeElementsPanelData(f.schema_id, "settings", {"settings"}, f.doc_id);
        REQUIRE(result.has_value());
        REQUIRE(result->content_model.size() >= 2);

        const auto& choice = result->content_model[1];
        CHECK(choice.current_count == 0);
        CHECK(!choice.is_satisfied);  // min_occurs=1 not met
        CHECK(!result->content_complete);
    }

    SECTION("Schema-only mode also returns min_occurs=1") {
        auto result = f.Helper()->ComputeElementsPanelData(f.schema_id, "settings", {}, "");
        REQUIRE(result.has_value());
        REQUIRE(result->content_model.size() >= 2);

        const auto& choice = result->content_model[1];
        CHECK(choice.node_type == "choice");
        CHECK(choice.min_occurs == 1);
    }
}
